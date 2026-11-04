// Pure numbers behind the audio stages (roadmap D3, D4, D6); the node graphs live in stages.ts.
import type { Compressor, Crossfeed } from "@shared/audio/settings";

/**
 * Stereo width as a 2×2 mix. With mid M = (L+R)/2 and side S = (L-R)/2, width w scales S:
 * L' = M + wS = L(1+w)/2 + R(1-w)/2, R' = R(1+w)/2 + L(1-w)/2. 0 = mono, 1 = unchanged, 2 = twice the side.
 */
export function widthMatrix(widthPct: number): { direct: number; cross: number } {
	const w = Math.min(2, Math.max(0, widthPct / 100));
	return { direct: (1 + w) / 2, cross: (1 - w) / 2 };
}

/**
 * Crossfeed for headphones after Bauer's stereophonic-to-binaural idea, with bs2b's three classic settings:
 * a low-passed, slightly delayed copy of each side fed to the other ear.
 */
export function crossfeedParams(level: Crossfeed): { cutoffHz: number; feedDb: number; delayS: number } | null {
	switch (level) {
		case "light":
			return { cutoffHz: 650, feedDb: 9.5, delayS: 0.0003 };
		case "medium":
			return { cutoffHz: 700, feedDb: 6, delayS: 0.0003 };
		case "strong":
			return { cutoffHz: 700, feedDb: 4.5, delayS: 0.0003 };
		default:
			return null;
	}
}

export const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * Pitch shifter modulation depth for a semitone shift. The shifter's delay lines ramp by 0.5·|m| s per second, so
 * the pitch ratio is 1 + 0.5·m up and 1 - 0.5·|m| down; m > 0 shifts up.
 */
export function pitchMult(semitones: number): number {
	const ratio = 2 ** (semitones / 12);
	return ratio >= 1 ? 2 * (ratio - 1) : -2 * (1 - ratio);
}

/**
 * Loudness normalization (dB) from YouTube's `loudnessDb` (how much louder than its reference the track is).
 * YouTube already turns loud tracks down, so only quiet tracks are raised, by at most 6 dB.
 */
export function normalizeGainDb(loudnessDb: number | null | undefined): number {
	if (typeof loudnessDb !== "number" || !Number.isFinite(loudnessDb) || loudnessDb >= 0) return 0;
	return Math.min(6, -loudnessDb);
}

export type CompressorParams = { threshold: number; knee: number; ratio: number; attack: number; release: number; makeupDb: number };

export function compressorParams(preset: Compressor): CompressorParams | null {
	switch (preset) {
		case "gentle":
			return { threshold: -18, knee: 12, ratio: 2, attack: 0.01, release: 0.25, makeupDb: 2 };
		case "night":
			return { threshold: -32, knee: 6, ratio: 6, attack: 0.003, release: 0.25, makeupDb: 8 };
		default:
			return null;
	}
}

/** Position on the horizontal circle around the listener: `deg` 0 = front, 90 = right (Web Audio: -z is front). */
export function circlePosition(deg: number, radius = 1): { x: number; z: number } {
	const r = (deg * Math.PI) / 180;
	return { x: Math.sin(r) * radius, z: -Math.cos(r) * radius };
}

/** FFT bin ranges [start, end) for `count` log-spaced visualizer bars between `minHz` and `maxHz`. */
export function logBins(count: number, binCount: number, sampleRate: number, minHz = 40, maxHz = 16000): Array<[number, number]> {
	const hzPerBin = sampleRate / 2 / binCount;
	const out: Array<[number, number]> = [];
	let prev = Math.max(1, Math.floor(minHz / hzPerBin));
	for (let i = 1; i <= count; i++) {
		const hz = minHz * (maxHz / minHz) ** (i / count);
		const end = Math.min(binCount, Math.max(prev + 1, Math.round(hz / hzPerBin)));
		out.push([prev, end]);
		prev = end;
	}
	return out;
}
