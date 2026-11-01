import { createRequire } from "node:module";
import path from "node:path";
import { lineScript, songHasKana } from "@shared/lyrics/extras";
import { createLogger } from "@shared/utils/console";
import { romanize as romanizeHangul } from "es-hangul";
import { pinyin } from "pinyin-pro";

const log = createLogger("lyrics-romanize");

type Kuroshiro = { convert(text: string, options: Record<string, unknown>): Promise<string> };

/** The Japanese dictionary holds about 100 MB in memory: load it for a Japanese song, drop it soon after. */
const RELEASE_AFTER_MS = 60_000;

let japanese: Promise<Kuroshiro> | null = null;
let releaseTimer: NodeJS.Timeout | null = null;

async function loadJapanese(): Promise<Kuroshiro> {
	const load = createRequire(__filename);
	// CommonJS, and these two wrap their export in a default of their own.
	const unwrap = <T>(mod: { default?: T } & T): T => mod.default ?? mod;
	const KuroshiroClass = unwrap(load("kuroshiro")) as new () => Kuroshiro & { init(analyzer: unknown): Promise<void> };
	const Analyzer = unwrap(load("kuroshiro-analyzer-kuromoji")) as new (options: { dictPath: string }) => unknown;
	const fromAnalyzer = createRequire(load.resolve("kuroshiro-analyzer-kuromoji"));
	const dictPath = path.join(path.dirname(fromAnalyzer.resolve("kuromoji/package.json")), "dict");
	const instance = new KuroshiroClass();
	await instance.init(new Analyzer({ dictPath }));
	return instance;
}

function getJapanese(): Promise<Kuroshiro> {
	if (releaseTimer) clearTimeout(releaseTimer);
	releaseTimer = setTimeout(() => {
		japanese = null;
		releaseTimer = null;
	}, RELEASE_AFTER_MS);
	releaseTimer.unref?.();
	japanese ??= loadJapanese().catch((err) => {
		japanese = null;
		throw err;
	});
	return japanese;
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** One Latin-letter line per input line; null where nothing needs reading (Latin lines, or a failed line). */
export async function romanizeLines(lines: string[]): Promise<(string | null)[]> {
	const isJapanese = songHasKana(lines);
	return await Promise.all(
		lines.map(async (line) => {
			const script = lineScript(line, isJapanese);
			if (!script) return null;
			try {
				if (script === "ko") return tidy(romanizeHangul(line));
				if (script === "zh") return tidy(pinyin(line, { nonZh: "consecutive" }));
				const kuroshiro = await getJapanese();
				return tidy(await kuroshiro.convert(line, { to: "romaji", mode: "spaced", romajiSystem: "hepburn" }));
			} catch (err) {
				log.warn(`romanizing a ${script} line failed`, err);
				return null;
			}
		}),
	);
}
