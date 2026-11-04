import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AfterInit, BaseProvider } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { romanizeLines } from "@main/lib/lyricsRomanize";
import { YtmClient } from "@main/ytm/ytm-client";
import { chunkLines, type LyricsExtrasRequest, type LyricsExtrasResult, normalizeExtrasRequest, parseGoogleTranslate, sameLanguage } from "@shared/lyrics/extras";
import { app, net } from "electron";

/** Google's limit for one request is about 5000 characters. */
const TRANSLATE_CHUNK_CHARS = 4000;
const TRANSLATE_TIMEOUT_MS = 10_000;

/** Hot-toggles youtube `lyrics` plugin via settings → IPC cmds; romanization and translation lines for the page. */
export default class LyricsProvider extends BaseProvider implements AfterInit {
	constructor() {
		super("lyrics");
		serverMain.on("lyrics:extras:request", (_ev, raw: unknown) => void this.answerExtras(raw));
	}

	get settingsInstance() {
		return this.getProvider("settings");
	}

	async AfterInit() {
		this.settingsInstance.onSettingChange("lyrics.enabled", (value) => void this.__onToggle(value), {
			debounce: 300,
		});
	}

	private async answerExtras(raw: unknown) {
		const req = normalizeExtrasRequest(raw);
		if (!req) return;
		try {
			YtmClient.push("lyrics:extras:result", await this.extras(req));
		} catch (err) {
			this.logger.warn("lyrics extras failed", err);
		}
	}

	private cacheFile(req: LyricsExtrasRequest) {
		const key = createHash("sha1")
			.update(JSON.stringify([req.lines, req.romanize, req.translateTo]))
			.digest("hex");
		return path.join(app.getPath("userData"), "lyrics-extras", `${key}.json`);
	}

	private async extras(req: LyricsExtrasRequest): Promise<LyricsExtrasResult> {
		const file = this.cacheFile(req);
		try {
			const cached = JSON.parse(await readFile(file, "utf8")) as Pick<LyricsExtrasResult, "romanized" | "translated">;
			return { videoId: req.videoId, romanized: cached.romanized, translated: cached.translated };
		} catch {
			/* not cached yet */
		}
		const none = req.lines.map(() => null);
		const [romanized, translated] = await Promise.all([
			req.romanize ? romanizeLines(req.lines) : none,
			req.translateTo
				? this.translate(req.lines, req.translateTo).catch((err) => {
						this.logger.warn("lyrics translation failed", err);
						return null;
					})
				: none,
		]);
		const result = { romanized, translated: translated ?? none };
		// A failed translation stays out of the cache, so the next play tries again.
		if (translated) {
			await mkdir(path.dirname(file), { recursive: true }).catch(() => undefined);
			await writeFile(file, JSON.stringify(result), "utf8").catch(() => undefined);
		}
		return { videoId: req.videoId, ...result };
	}

	/** Google Translate's free endpoint. Lines go out with their line breaks, which it keeps. */
	private async translate(lines: string[], target: string): Promise<(string | null)[]> {
		const out: (string | null)[] = lines.map(() => null);
		const filled = lines.flatMap((line, index) => (line.trim() ? [{ line: line.trim(), index }] : []));
		let at = 0;
		for (const chunk of chunkLines(
			filled.map((f) => f.line),
			TRANSLATE_CHUNK_CHARS,
		)) {
			const res = await net.fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=${encodeURIComponent(target)}`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
				body: new URLSearchParams({ q: chunk.join("\n") }).toString(),
				signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
			});
			if (!res.ok) throw new Error(`translate ${res.status}`);
			const parsed = parseGoogleTranslate(await res.json());
			if (!parsed) throw new Error("translate: unknown answer");
			// The song is already in this language: no second line that repeats it.
			if (sameLanguage(parsed.source, target)) return lines.map(() => null);
			const translated = parsed.text.split("\n");
			// Line breaks lost: better no translation than lines under the wrong lyrics.
			if (translated.length === chunk.length) {
				translated.forEach((text, i) => {
					const clean = text.trim();
					const { index, line } = filled[at + i];
					out[index] = clean && clean !== line ? clean : null;
				});
			}
			at += chunk.length;
		}
		return out;
	}

	private async __onToggle(value: unknown) {
		if (value) await this.enable();
		else await this.disable();
	}

	private async enable() {
		this.logger.debug("Enabling lyrics");
		try {
			await this.isYtmReady();
		} catch (err) {
			this.logger.warn("ytm not fully ready, enabling lyrics anyway", err);
		}
		await this.executeCommand("enable");
	}

	private async disable() {
		this.logger.debug("Disabling lyrics");
		try {
			await this.isYtmReady();
		} catch (err) {
			this.logger.warn("ytm not fully ready, disabling lyrics anyway", err);
		}
		await this.executeCommand("disable");
	}
}
