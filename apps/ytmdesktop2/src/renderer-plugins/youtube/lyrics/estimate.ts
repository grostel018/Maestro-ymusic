import type { LyricLine, LyricWord } from "./types";

// Word timing for line-synced lyrics (LRCLib, captions): the line's time is split across its words by syllable
// count, the usual approach when only line times are known (see lyric-align's proportional interpolation). Singers
// rarely use the whole gap to the next line, so the sung part is capped by the song's own pace: the typical time per
// syllable of its lines, measured over the lines sung back to back (a rap verse is fast, a ballad slow).

/** Pace when a song has too few lines to measure. */
const DEFAULT_SYLLABLE_MS = 300;
const MIN_SYLLABLE_MS = 110;
const MAX_SYLLABLE_MS = 650;
/** Lines this long hold a pause; they say nothing about the pace. */
const PACE_LINE_MAX_MS = 7000;
/** A line may be sung a little slower than the song's typical pace before the rest counts as a pause. */
const PACE_SLACK = 1.25;
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

/** Syllables of a line, counted the way the words are weighted. */
function lineSyllables(text: string): number {
	return units(text).reduce((sum, p) => sum + (CJK.test(p) ? 1 : syllables(p)), 0);
}

/**
 * The song's time per syllable: the lower-middle (40th percentile) of its lines' time per syllable, so lines followed
 * by a breath or pause don't slow it down.
 */
export function songPace(lines: LyricLine[]): number {
	const rates = lines
		.filter((l) => Number.isFinite(l.durationMs) && l.durationMs > 0 && l.durationMs <= PACE_LINE_MAX_MS)
		.map((l) => l.durationMs / Math.max(1, lineSyllables(l.text)))
		.sort((a, b) => a - b);
	if (rates.length < 4) return DEFAULT_SYLLABLE_MS;
	const pace = rates[Math.floor(rates.length * 0.4)];
	return Math.min(MAX_SYLLABLE_MS, Math.max(MIN_SYLLABLE_MS, pace));
}

/** Estimated word cues for a line with no word timing, or null when it has no usable time window. */
export function estimateWords(line: LyricLine, paceMs = DEFAULT_SYLLABLE_MS): LyricWord[] | null {
	if (!Number.isFinite(line.durationMs) || line.durationMs <= 0) return null;
	const parts = units(line.text);
	if (parts.length < 2) return null;
	const weights = parts.map((p) => (CJK.test(p) ? 1 : syllables(p)));
	const total = weights.reduce((a, b) => a + b, 0);
	const span = Math.max(MIN_SPAN_MS, Math.min(line.durationMs * SPAN_SHARE, total * paceMs * PACE_SLACK));
	let t = line.timeMs;
	return parts.map((text, i) => {
		const durationMs = (span * weights[i]) / total;
		const word = { text, timeMs: Math.round(t), durationMs: Math.round(durationMs) };
		t += durationMs;
		return word;
	});
}

/** The line with estimated words added, or the line itself when it already has words or concurrent parts. */
export function withEstimatedWords(line: LyricLine, paceMs = DEFAULT_SYLLABLE_MS): LyricLine {
	if (line.words?.length || (line.parts && line.parts.length > 1)) return line;
	const words = estimateWords(line, paceMs);
	return words ? { ...line, words } : line;
}

/** All lines with estimated words, at the song's own pace. Lines with real word timing are kept as they are. */
export function withEstimatedTiming(lines: LyricLine[]): LyricLine[] {
	if (lines.some((l) => l.words?.length)) return lines;
	const pace = songPace(lines);
	return lines.map((l) => withEstimatedWords(l, pace));
}
