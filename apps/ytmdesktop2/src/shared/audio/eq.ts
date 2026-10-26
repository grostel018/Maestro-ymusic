// Equalizer math (roadmap D2): presets, the filters a setting stands for, the anti-clipping guard and the AutoEq
// `ParametricEQ.txt` / `INDEX.md` readers. Pure, shared by the page stage, the settings page and main.
// AutoEq data: jaakkopasanen/AutoEq (MIT), fetched on demand. The preset idea follows pear-desktop@7c55260:
// src/plugins/equalizer (MIT); the values are ours.
import { type AudioSettings, type EqFilter, GRAPHIC_BANDS } from "./settings";

export const GRAPHIC_Q = 1.41;

export const EQ_PRESETS: Array<{ id: string; label: string; bands: number[] }> = [
	{ id: "flat", label: "Flat", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	{ id: "bass-boost", label: "Bass Boost", bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
	{ id: "bass-reducer", label: "Bass Reducer", bands: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0] },
	{ id: "vocal", label: "Vocal", bands: [-2, -2, -1, 0, 2, 4, 4, 3, 1, 0] },
	{ id: "treble", label: "Treble", bands: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6] },
	{ id: "loudness", label: "Loudness", bands: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
	{ id: "acoustic", label: "Acoustic", bands: [4, 4, 3, 1, 2, 2, 3, 3, 3, 2] },
	{ id: "electronic", label: "Electronic", bands: [4, 4, 1, 0, -2, 2, 1, 1, 4, 5] },
	{ id: "hip-hop", label: "Hip-Hop", bands: [5, 4, 1, 3, -1, -1, 1, -1, 2, 3] },
	{ id: "classical", label: "Classical", bands: [4, 3, 3, 2, -1, -1, 0, 2, 3, 4] },
	{ id: "rock", label: "Rock", bands: [5, 4, 3, 1, -1, -1, 1, 3, 4, 4] },
	{ id: "pop", label: "Pop", bands: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
	{ id: "late-night", label: "Late Night", bands: [-3, -2, -1, 0, 1, 2, 2, 1, -1, -2] },
];

/** The filters and preamp (dB, before the guard) an EQ setting stands for. */
export function eqFilters(eq: AudioSettings["eq"]): { filters: EqFilter[]; preamp: number } {
	if (eq.mode === "autoeq" && eq.autoeq) return { filters: eq.autoeq.filters, preamp: eq.autoeq.preamp + eq.preamp };
	if (eq.mode === "parametric") return { filters: eq.filters, preamp: eq.preamp };
	const filters = GRAPHIC_BANDS.map((frequency, i) => ({ type: "peaking" as const, frequency, q: GRAPHIC_Q, gain: eq.bands[i] ?? 0 })).filter(
		(f) => f.gain !== 0,
	);
	return { filters, preamp: eq.preamp };
}

/**
 * Magnitude in dB of one biquad at `f` Hz (Audio EQ Cookbook, as Web Audio implements it: shelves ignore Q and use
 * slope 1).
 */
export function biquadGainDb(filter: EqFilter, f: number, fs = 48000): number {
	const A = 10 ** (filter.gain / 40);
	const w0 = (2 * Math.PI * filter.frequency) / fs;
	const cos = Math.cos(w0);
	const sin = Math.sin(w0);
	let b0: number;
	let b1: number;
	let b2: number;
	let a0: number;
	let a1: number;
	let a2: number;
	if (filter.type === "peaking") {
		const alpha = sin / (2 * filter.q);
		b0 = 1 + alpha * A;
		b1 = -2 * cos;
		b2 = 1 - alpha * A;
		a0 = 1 + alpha / A;
		a1 = -2 * cos;
		a2 = 1 - alpha / A;
	} else {
		const alpha = (sin / 2) * Math.SQRT2;
		const s = 2 * Math.sqrt(A) * alpha;
		if (filter.type === "lowshelf") {
			b0 = A * (A + 1 - (A - 1) * cos + s);
			b1 = 2 * A * (A - 1 - (A + 1) * cos);
			b2 = A * (A + 1 - (A - 1) * cos - s);
			a0 = A + 1 + (A - 1) * cos + s;
			a1 = -2 * (A - 1 + (A + 1) * cos);
			a2 = A + 1 + (A - 1) * cos - s;
		} else {
			b0 = A * (A + 1 + (A - 1) * cos + s);
			b1 = -2 * A * (A - 1 + (A + 1) * cos);
			b2 = A * (A + 1 + (A - 1) * cos - s);
			a0 = A + 1 - (A - 1) * cos + s;
			a1 = 2 * (A - 1 - (A + 1) * cos);
			a2 = A + 1 - (A - 1) * cos - s;
		}
	}
	const w = (2 * Math.PI * f) / fs;
	const mag = (c0: number, c1: number, c2: number) => {
		const re = c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w);
		const im = -(c1 * Math.sin(w) + c2 * Math.sin(2 * w));
		return Math.hypot(re, im);
	};
	return 20 * Math.log10(mag(b0, b1, b2) / mag(a0, a1, a2));
}

/** Log-spaced frequencies from 20 Hz to 20 kHz. */
export function curveFrequencies(points = 120): number[] {
	return Array.from({ length: points }, (_, i) => 20 * 1000 ** (i / (points - 1)));
}

/** The summed response (dB) of `filters` plus `preamp` at each frequency. */
export function eqCurve(filters: EqFilter[], preamp = 0, freqs = curveFrequencies(), fs = 48000): number[] {
	return freqs.map((f) => filters.reduce((sum, filter) => sum + biquadGainDb(filter, f, fs), preamp));
}

/** Negative gain (dB) that keeps the loudest point of the curve at or below 0 dB. */
export function clipGuard(filters: EqFilter[], fs = 48000): number {
	if (!filters.length) return 0;
	const peak = Math.max(...eqCurve(filters, 0, curveFrequencies(200), fs));
	return peak > 0 ? -Math.round(peak * 10) / 10 : 0;
}

/** Total preamp for a setting: the guard against clipping plus the user's preamp (an AutoEq preamp already guards). */
export function totalPreamp(eq: AudioSettings["eq"], fs = 48000): number {
	const { filters, preamp } = eqFilters(eq);
	const guard = clipGuard(filters, fs);
	if (eq.mode === "autoeq" && eq.autoeq) return Math.min(eq.autoeq.preamp, guard) + eq.preamp;
	return guard + preamp;
}

const AUTOEQ_TYPES: Record<string, EqFilter["type"]> = { PK: "peaking", PEQ: "peaking", LSC: "lowshelf", LS: "lowshelf", HSC: "highshelf", HS: "highshelf" };

/** Reads AutoEq's `ParametricEQ.txt` (Equalizer APO format). Unknown filter types and OFF lines are skipped. */
export function parseParametricEq(text: string): { preamp: number; filters: EqFilter[] } {
	let preamp = 0;
	const filters: EqFilter[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		const pre = /^Preamp:\s*(-?[\d.]+)\s*dB/i.exec(line);
		if (pre) {
			preamp = Number(pre[1]);
			continue;
		}
		const m = /^Filter\s*\d*:\s*(ON|OFF)\s+([A-Z]+)\s+Fc\s+([\d.]+)\s*Hz(?:\s+Gain\s+(-?[\d.]+)\s*dB)?(?:\s+Q\s+([\d.]+))?/i.exec(line);
		if (!m || m[1].toUpperCase() !== "ON") continue;
		const type = AUTOEQ_TYPES[m[2].toUpperCase()];
		if (!type) continue;
		filters.push({ type, frequency: Number(m[3]), gain: Number(m[4] ?? 0), q: Number(m[5] ?? 0.71) });
	}
	return { preamp: Number.isFinite(preamp) ? preamp : 0, filters };
}

export type AutoEqEntry = { name: string; source: string; path: string };

/** Reads AutoEq's `results/INDEX.md`: `- [Model](./source/type/Model%20Name) by source`. */
export function parseAutoEqIndex(md: string): AutoEqEntry[] {
	const out: AutoEqEntry[] = [];
	for (const line of md.split(/\r?\n/)) {
		const m = /^\s*-\s*\[([^\]]+)\]\(\.\/([^)]+)\)(?:\s+by\s+([^\s,]+(?:\s[^\s,]+)*))?/.exec(line);
		if (!m) continue;
		out.push({ name: m[1], path: m[2], source: (m[3] ?? "").replace(/\s+on\s+.*$/, "").trim() });
	}
	return out;
}

/** Up to `limit` index entries whose name contains every word of `query` (case-insensitive). */
export function searchAutoEq(entries: AutoEqEntry[], query: string, limit = 20): AutoEqEntry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return entries.filter((e) => words.every((w) => e.name.toLowerCase().includes(w))).slice(0, limit);
}

/** Path (under `results/`) of an entry's ParametricEQ file. */
export function parametricEqPath(entry: AutoEqEntry): string {
	const folder = entry.path.replace(/\/+$/, "");
	const model = decodeURIComponent(folder.split("/").pop() ?? entry.name);
	return `${folder}/${encodeURIComponent(`${model} ParametricEQ.txt`)}`;
}
