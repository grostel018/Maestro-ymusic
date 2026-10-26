import { describe, expect, it } from "vitest";
import { circlePosition, compressorParams, crossfeedParams, logBins, normalizeGainDb, pitchMult, widthMatrix } from "./dsp";

describe("dsp", () => {
	it("width keeps the signal at 100 %, folds to mono at 0 % and doubles the side at 200 %", () => {
		expect(widthMatrix(100)).toEqual({ direct: 1, cross: 0 });
		expect(widthMatrix(0)).toEqual({ direct: 0.5, cross: 0.5 });
		const w = widthMatrix(200);
		// L' - R' = (direct - cross)(L - R): twice the side. L' + R' = (direct + cross)(L + R): mid unchanged.
		expect(w.direct - w.cross).toBe(2);
		expect(w.direct + w.cross).toBe(1);
	});

	it("crossfeed has three levels; stronger means less attenuation", () => {
		expect(crossfeedParams("off")).toBeNull();
		const feeds = (["light", "medium", "strong"] as const).map((l) => crossfeedParams(l)?.feedDb ?? 0);
		expect(feeds[0]).toBeGreaterThan(feeds[1]);
		expect(feeds[1]).toBeGreaterThan(feeds[2]);
	});

	it("pitch depth maps semitones to the shifter's ratio", () => {
		expect(pitchMult(0)).toBe(0);
		expect(1 + pitchMult(12) / 2).toBeCloseTo(2);
		expect(1 + pitchMult(-6) / 2).toBeCloseTo(2 ** (-6 / 12));
	});

	it("normalization raises quiet tracks only, by at most 6 dB", () => {
		expect(normalizeGainDb(null)).toBe(0);
		expect(normalizeGainDb(4)).toBe(0);
		expect(normalizeGainDb(-3)).toBe(3);
		expect(normalizeGainDb(-10)).toBe(6);
	});

	it("compressor presets", () => {
		expect(compressorParams("off")).toBeNull();
		expect(compressorParams("night")?.ratio).toBeGreaterThan(compressorParams("gentle")?.ratio ?? 99);
	});

	it("circle positions put 90 degrees on the right and 0 in front", () => {
		expect(circlePosition(90).x).toBeCloseTo(1);
		expect(circlePosition(0).z).toBeCloseTo(-1);
	});

	it("visualizer bars cover increasing, non-empty bin ranges", () => {
		const bins = logBins(48, 1024, 48000);
		expect(bins).toHaveLength(48);
		for (const [a, b] of bins) expect(b).toBeGreaterThan(a);
		for (let i = 1; i < bins.length; i++) expect(bins[i][0]).toBe(bins[i - 1][1]);
		expect(bins.at(-1)?.[1]).toBeLessThanOrEqual(1024);
	});
});
