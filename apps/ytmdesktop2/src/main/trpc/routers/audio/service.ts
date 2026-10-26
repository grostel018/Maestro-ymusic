import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseProvider } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { type AutoEqEntry, parametricEqPath, parseAutoEqIndex, parseParametricEq, searchAutoEq } from "@shared/audio/eq";
import type { AutoEqProfile } from "@shared/audio/settings";
import { apiBase } from "@shared/e2e/apiBase";
import { app, net } from "electron";

/** AutoEq (jaakkopasanen/AutoEq, MIT) raw files. Overridable only under the e2e bench, see shared/e2e/apiBase. */
const AUTOEQ_ROOT = apiBase("autoeq", "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master");
const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export type AudioGraph = { attached: boolean; running: boolean; chain: string[]; failed: string[]; sinkId: string };

/**
 * Main side of the audio engine (roadmap D1, D2): keeps the page's last chain report for the settings page, gives
 * the page a user gesture when its AudioContext can't start alone, and fetches AutoEq headphone profiles.
 */
export default class AudioProvider extends BaseProvider {
	private graph: AudioGraph | null = null;
	private index: AutoEqEntry[] | null = null;

	constructor() {
		super("audio");
		serverMain.on("audio:graph", (_ev, info: AudioGraph) => {
			this.graph = info ?? null;
		});
		serverMain.on("audio:gesture-needed", () => void this.grantGesture());
	}

	getGraph(): AudioGraph | null {
		return this.graph;
	}

	/** The page's AudioContext needs a user activation to start; a script run with `userGesture` gives it one. */
	private async grantGesture(): Promise<void> {
		let wc: Electron.WebContents | undefined;
		try {
			wc = this.views?.youtubeView?.webContents;
		} catch {
			return; // no main window yet
		}
		if (!wc || wc.isDestroyed()) return;
		await wc.executeJavaScript("window.__ytmdAudio?.resume()", true).catch((err) => this.logger.warn("audio gesture failed", err));
	}

	private get cacheDir() {
		return path.join(app.getPath("userData"), "autoeq");
	}

	private async fetchText(url: string): Promise<string> {
		const res = await net.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`AutoEq ${res.status} for ${url}`);
		return await res.text();
	}

	private async loadIndex(): Promise<AutoEqEntry[]> {
		if (this.index) return this.index;
		const file = path.join(this.cacheDir, "INDEX.md");
		const fresh = await stat(file)
			.then((s) => Date.now() - s.mtimeMs < INDEX_MAX_AGE_MS)
			.catch(() => false);
		let md: string | null = fresh ? await readFile(file, "utf8").catch(() => null) : null;
		if (md == null) {
			try {
				md = await this.fetchText(`${AUTOEQ_ROOT}/results/INDEX.md`);
				await mkdir(this.cacheDir, { recursive: true });
				await writeFile(file, md, "utf8");
			} catch (err) {
				// Offline: an old copy is better than nothing.
				md = await readFile(file, "utf8").catch(() => null);
				if (md == null) throw err;
			}
		}
		this.index = parseAutoEqIndex(md);
		return this.index;
	}

	async autoeqSearch(query: string): Promise<AutoEqEntry[]> {
		return searchAutoEq(await this.loadIndex(), query);
	}

	async autoeqLoad(entry: AutoEqEntry): Promise<AutoEqProfile> {
		const rel = parametricEqPath(entry);
		if (rel.includes("..")) throw new Error("bad AutoEq path");
		const file = path.join(this.cacheDir, "profiles", `${encodeURIComponent(rel)}.txt`);
		let text = await readFile(file, "utf8").catch(() => null);
		if (text == null) {
			text = await this.fetchText(`${AUTOEQ_ROOT}/results/${rel}`);
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, text, "utf8");
		}
		const { preamp, filters } = parseParametricEq(text);
		if (!filters.length) throw new Error(`No filters in the AutoEq profile for ${entry.name}`);
		return { name: entry.name, preamp, filters: filters.slice(0, 10) };
	}
}
