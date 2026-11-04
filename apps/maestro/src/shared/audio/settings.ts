// Audio lab settings (roadmap phase D), shared by main (defaults, migration), the page (audio engine) and the
// settings page. `normalizeAudio` is the one reader: anything missing or out of range falls back to the default.

export type EqFilterType = "peaking" | "lowshelf" | "highshelf";
export type EqFilter = { type: EqFilterType; frequency: number; q: number; gain: number };
export type EqMode = "graphic" | "parametric" | "autoeq";
export type AutoEqProfile = { name: string; preamp: number; filters: EqFilter[] };
export type Crossfeed = "off" | "light" | "medium" | "strong";
export type Compressor = "off" | "gentle" | "night";
export type VisualizerStyle = "bars" | "wave";

export type AudioSettings = {
	eq: {
		enabled: boolean;
		mode: EqMode;
		/** Graphic preset id, or "custom" once a band is moved by hand. */
		preset: string;
		/** Gains in dB for GRAPHIC_BANDS. */
		bands: number[];
		filters: EqFilter[];
		/** User preamp in dB, added to the automatic anti-clipping guard. */
		preamp: number;
		autoeq: AutoEqProfile | null;
		userPresets: Array<{ name: string; bands: number[] }>;
	};
	spatial: { crossfeed: Crossfeed; width: number; surround: boolean; rotate: boolean; rotateSpeed: number };
	dynamics: { normalize: boolean; compressor: Compressor };
	transitions: { crossfade: number; skipSilence: boolean };
	karaoke: { enabled: boolean; amount: number };
	pitch: { semitones: number };
	visualizer: { enabled: boolean; style: VisualizerStyle };
	/** Mouse wheel over the player bar changes the volume in 1 % steps. */
	volumeWheel: boolean;
};

/** 10-band graphic equalizer centre frequencies (Hz). */
export const GRAPHIC_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_GAIN_LIMIT = 12;
export const MAX_FILTERS = 10;
export const PITCH_LIMIT = 6;
export const CROSSFADE_MAX = 12;

export const DEFAULT_AUDIO: AudioSettings = {
	eq: {
		enabled: false,
		mode: "graphic",
		preset: "flat",
		bands: GRAPHIC_BANDS.map(() => 0),
		filters: [],
		preamp: 0,
		autoeq: null,
		userPresets: [],
	},
	spatial: { crossfeed: "off", width: 100, surround: false, rotate: false, rotateSpeed: 0.1 },
	dynamics: { normalize: false, compressor: "off" },
	transitions: { crossfade: 0, skipSilence: false },
	karaoke: { enabled: false, amount: 0.8 },
	pitch: { semitones: 0 },
	visualizer: { enabled: false, style: "bars" },
	volumeWheel: true,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
	typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

function bandsOf(v: unknown): number[] {
	const a = Array.isArray(v) ? v : [];
	return GRAPHIC_BANDS.map((_, i) => num(a[i], 0, -EQ_GAIN_LIMIT, EQ_GAIN_LIMIT));
}

export function normalizeFilter(v: unknown): EqFilter | null {
	const f = obj(v);
	if (typeof f.frequency !== "number" || !Number.isFinite(f.frequency)) return null;
	return {
		type: oneOf(f.type, ["peaking", "lowshelf", "highshelf"] as const, "peaking"),
		frequency: num(f.frequency, 1000, 10, 22000),
		q: num(f.q, 1, 0.05, 30),
		gain: num(f.gain, 0, -30, 30),
	};
}

const filtersOf = (v: unknown) =>
	(Array.isArray(v) ? v : [])
		.map(normalizeFilter)
		.filter((f): f is EqFilter => !!f)
		.slice(0, MAX_FILTERS);

export function normalizeAudio(raw: unknown): AudioSettings {
	const a = obj(raw);
	const eq = obj(a.eq);
	const sp = obj(a.spatial);
	const dy = obj(a.dynamics);
	const tr = obj(a.transitions);
	const ka = obj(a.karaoke);
	const pi = obj(a.pitch);
	const vi = obj(a.visualizer);
	const ae = obj(eq.autoeq);
	const d = DEFAULT_AUDIO;
	return {
		eq: {
			enabled: bool(eq.enabled, d.eq.enabled),
			mode: oneOf(eq.mode, ["graphic", "parametric", "autoeq"] as const, d.eq.mode),
			preset: typeof eq.preset === "string" && eq.preset ? eq.preset : d.eq.preset,
			bands: bandsOf(eq.bands),
			filters: filtersOf(eq.filters),
			preamp: num(eq.preamp, 0, -24, 12),
			autoeq: typeof ae.name === "string" && ae.name ? { name: ae.name, preamp: num(ae.preamp, 0, -30, 12), filters: filtersOf(ae.filters) } : null,
			userPresets: (Array.isArray(eq.userPresets) ? eq.userPresets : [])
				.map(obj)
				.filter((p) => typeof p.name === "string" && p.name)
				.map((p) => ({ name: String(p.name), bands: bandsOf(p.bands) })),
		},
		spatial: {
			crossfeed: oneOf(sp.crossfeed, ["off", "light", "medium", "strong"] as const, d.spatial.crossfeed),
			width: num(sp.width, d.spatial.width, 0, 200),
			surround: bool(sp.surround, d.spatial.surround),
			rotate: bool(sp.rotate, d.spatial.rotate),
			rotateSpeed: num(sp.rotateSpeed, d.spatial.rotateSpeed, 0.02, 1),
		},
		dynamics: {
			normalize: bool(dy.normalize, d.dynamics.normalize),
			compressor: oneOf(dy.compressor, ["off", "gentle", "night"] as const, d.dynamics.compressor),
		},
		transitions: {
			crossfade: num(tr.crossfade, d.transitions.crossfade, 0, CROSSFADE_MAX),
			skipSilence: bool(tr.skipSilence, d.transitions.skipSilence),
		},
		karaoke: { enabled: bool(ka.enabled, d.karaoke.enabled), amount: num(ka.amount, d.karaoke.amount, 0, 1) },
		pitch: { semitones: Math.round(num(pi.semitones, 0, -PITCH_LIMIT, PITCH_LIMIT)) },
		visualizer: { enabled: bool(vi.enabled, d.visualizer.enabled), style: oneOf(vi.style, ["bars", "wave"] as const, d.visualizer.style) },
		volumeWheel: bool(a.volumeWheel, d.volumeWheel),
	};
}
