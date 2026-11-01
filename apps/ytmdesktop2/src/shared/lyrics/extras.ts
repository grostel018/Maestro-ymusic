// Romanization and translation lines under the lyrics (roadmap F2, G8): what the page asks main for and gets back,
// and the parts that need no libraries.

export type LyricsExtrasRequest = {
	videoId: string;
	lines: string[];
	romanize: boolean;
	/** Google Translate language code, or null for no translation. */
	translateTo: string | null;
};

export type LyricsExtrasResult = {
	videoId: string;
	/** Same length as the request's lines; null where the line needs no extra line. */
	romanized: (string | null)[];
	translated: (string | null)[];
};

export const TRANSLATE_LANGUAGES = [
	["en", "English"],
	["fr", "French"],
	["es", "Spanish"],
	["pt", "Portuguese"],
	["de", "German"],
	["it", "Italian"],
	["nl", "Dutch"],
	["pl", "Polish"],
	["ru", "Russian"],
	["uk", "Ukrainian"],
	["tr", "Turkish"],
	["ar", "Arabic"],
	["hi", "Hindi"],
	["id", "Indonesian"],
	["vi", "Vietnamese"],
	["th", "Thai"],
	["ja", "Japanese"],
	["ko", "Korean"],
	["zh-CN", "Chinese (Simplified)"],
	["zh-TW", "Chinese (Traditional)"],
] as const;

export type LyricsScript = "ja" | "ko" | "zh";

const KANA = /[぀-ヿｦ-ﾟ]/;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

/** Kanji look like Chinese, so one line with kana makes the whole song Japanese. */
export function songHasKana(lines: string[]): boolean {
	return lines.some((line) => KANA.test(line));
}

/** Which romanizer a line needs, or null when it has none of these scripts. */
export function lineScript(line: string, japaneseSong: boolean): LyricsScript | null {
	if (HANGUL.test(line)) return "ko";
	if (KANA.test(line)) return "ja";
	if (HAN.test(line)) return japaneseSong ? "ja" : "zh";
	return null;
}

/** Validates what the page sent; null when it isn't a usable request. */
export function normalizeExtrasRequest(raw: unknown): LyricsExtrasRequest | null {
	const r = raw as Partial<LyricsExtrasRequest> | null;
	if (!r || typeof r.videoId !== "string" || !r.videoId || !Array.isArray(r.lines) || r.lines.length > 1000) return null;
	const translateTo = typeof r.translateTo === "string" && /^[a-zA-Z-]{2,7}$/.test(r.translateTo) ? r.translateTo : null;
	return { videoId: r.videoId, lines: r.lines.map((l) => (typeof l === "string" ? l.slice(0, 1000) : "")), romanize: r.romanize === true, translateTo };
}

/** Google's answer: `[[["translated", "original", ...], ...], null, "source language", ...]`. */
export function parseGoogleTranslate(json: unknown): { text: string; source: string | null } | null {
	if (!Array.isArray(json) || !Array.isArray(json[0])) return null;
	const text = (json[0] as unknown[]).map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")).join("");
	return { text, source: typeof json[2] === "string" ? json[2] : null };
}

/** Lines grouped so each request stays under `maxChars`. */
export function chunkLines(lines: string[], maxChars: number): string[][] {
	const chunks: string[][] = [];
	let size = 0;
	for (const line of lines) {
		if (!chunks.length || size + line.length + 1 > maxChars) {
			chunks.push([]);
			size = 0;
		}
		chunks[chunks.length - 1].push(line);
		size += line.length + 1;
	}
	return chunks;
}

/** Same base language, so a French song isn't "translated" to French (zh-CN and zh count as the same). */
export function sameLanguage(a: string | null, b: string): boolean {
	return !!a && a.split("-")[0].toLowerCase() === b.split("-")[0].toLowerCase();
}
