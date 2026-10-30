import type { LyricLine, LyricWord } from "./types";

// Word timing for line-synced lyrics (LRCLib, captions): the line's time is split across its words by syllable
// count, the usual approach when only line times are known (see lyric-align's proportional interpolation). Singers
// rarely use the whole gap to the next line, so the sung part is capped by a per-syllable pace.

/** Slowest pace we assume per syllable; longer gaps are a pause after the line, not slower singing. */
const MAX_SYLLABLE_MS = 420;
const MIN_SPAN_MS = 300;
/** Ends a little before the next line, so the last word completes. */
const SPAN_SHARE = 0.92;

const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøœùúûüýÿаеёиоуыэюяіїє]+/gi;

/** Rough syllable count: vowel groups, at least 1. */
export function syllables(word: string): number {
	return Math.max(1, word.match(VOWELS)?.length ?? 0);
}

/** Display units with their trailing space: words, and each CJK character on its own. */
function units(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(/\S+\s*/g)) {
		const token = m[0];
		if (CJK.test(token)) out.push(...(token.match(/[぀-ヿ㐀-鿿가-힯]|[^぀-ヿ㐀-鿿가-힯]+/g) ?? [token]));
		else out.push(token);
	}
	return out;
}

/** Estimated word cues for a line with no word timing, or null when it has no usable time window. */
export function estimateWords(line: LyricLine): LyricWord[] | null {
	if (!Number.isFinite(line.durationMs) || line.durationMs <= 0) return null;
	const parts = units(line.text);
	if (parts.length < 2) return null;
	const weights = parts.map((p) => (CJK.test(p) ? 1 : syllables(p)));
	const total = weights.reduce((a, b) => a + b, 0);
	const span = Math.max(MIN_SPAN_MS, Math.min(line.durationMs * SPAN_SHARE, total * MAX_SYLLABLE_MS));
	let t = line.timeMs;
	return parts.map((text, i) => {
		const durationMs = (span * weights[i]) / total;
		const word = { text, timeMs: Math.round(t), durationMs: Math.round(durationMs) };
		t += durationMs;
		return word;
	});
}

/** The line with estimated words added, or the line itself when it already has words or concurrent parts. */
export function withEstimatedWords(line: LyricLine): LyricLine {
	if (line.words?.length || (line.parts && line.parts.length > 1)) return line;
	const words = estimateWords(line);
	return words ? { ...line, words } : line;
}
