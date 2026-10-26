import { describe, expect, it } from "vitest";
import { biquadGainDb, clipGuard, EQ_PRESETS, eqCurve, eqFilters, parametricEqPath, parseAutoEqIndex, parseParametricEq, searchAutoEq, totalPreamp } from "./eq";
import { GRAPHIC_BANDS, normalizeAudio } from "./settings";

// Shape of AutoEq's results/<source>/<type>/<model>/<model> ParametricEQ.txt, with one OFF and one unknown filter added.
const PARAMETRIC = [
	"Preamp: -6.3 dB",
	"Filter 1: ON LSC Fc 105 Hz Gain 5.8 dB Q 0.70",
	"Filter 2: ON PK Fc 186 Hz Gain -2.4 dB Q 0.61",
	"Filter 3: ON PK Fc 3036 Hz Gain 3.7 dB Q 2.32",
	"Filter 4: OFF PK Fc 5000 Hz Gain 2.0 dB Q 1.00",
	"Filter 5: ON HSC Fc 10000 Hz Gain 2.1 dB Q 0.70",
	"Filter 6: ON XX Fc 100 Hz Gain 1 dB Q 1",
].join("\r\n");

describe("equalizer math", () => {
	it("a peaking filter has its gain at its centre and none far away", () => {
		const f = { type: "peaking" as const, frequency: 1000, q: 1.41, gain: 6 };
		expect(biquadGainDb(f, 1000)).toBeCloseTo(6, 1);
		expect(Math.abs(biquadGainDb(f, 20))).toBeLessThan(0.1);
	});

	it("shelves reach their gain on their side", () => {
		expect(biquadGainDb({ type: "lowshelf", frequency: 100, q: 0.7, gain: 6 }, 20)).toBeCloseTo(6, 0);
		expect(biquadGainDb({ type: "highshelf", frequency: 8000, q: 0.7, gain: -6 }, 20000)).toBeCloseTo(-6, 0);
	});

	it("the guard keeps the summed curve at or below 0 dB", () => {
		const bass = eqFilters(normalizeAudio({ eq: { bands: EQ_PRESETS.find((p) => p.id === "bass-boost")?.bands } }).eq).filters;
		const guard = clipGuard(bass);
		expect(guard).toBeLessThan(0);
		expect(Math.max(...eqCurve(bass, guard))).toBeLessThanOrEqual(0.05);
		expect(clipGuard([{ type: "peaking", frequency: 1000, q: 1, gain: -6 }])).toBe(0);
	});

	it("has 13 presets covering every band", () => {
		expect(EQ_PRESETS).toHaveLength(13);
		for (const p of EQ_PRESETS) expect(p.bands).toHaveLength(GRAPHIC_BANDS.length);
	});

	it("graphic mode drops flat bands; AutoEq mode uses the profile and its preamp", () => {
		const graphic = normalizeAudio({ eq: { bands: [0, 3, 0, 0, 0, 0, 0, 0, 0, -2] } }).eq;
		expect(eqFilters(graphic).filters.map((f) => f.frequency)).toEqual([64, 16000]);
		const auto = normalizeAudio({
			eq: { mode: "autoeq", preamp: -1, autoeq: { name: "HD 600", preamp: -6.3, filters: [{ type: "peaking", frequency: 100, q: 1, gain: 2 }] } },
		}).eq;
		expect(eqFilters(auto).preamp).toBeCloseTo(-7.3);
		expect(totalPreamp(auto)).toBeCloseTo(-7.3);
	});
});

describe("AutoEq", () => {
	it("parses ParametricEQ.txt: preamp, ON filters, known types only", () => {
		const r = parseParametricEq(PARAMETRIC);
		expect(r.preamp).toBe(-6.3);
		expect(r.filters.map((f) => f.type)).toEqual(["lowshelf", "peaking", "peaking", "highshelf"]);
		expect(r.filters[2]).toEqual({ type: "peaking", frequency: 3036, gain: 3.7, q: 2.32 });
	});

	it("reads INDEX.md, searches by words and builds the file path", () => {
		const md = [
			"# Index",
			"- [Sennheiser HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600) by oratory1990",
			"- [Sennheiser HD 650](./crinacle/GRAS%2043AG-7%20over-ear/Sennheiser%20HD%20650) by crinacle on GRAS 43AG-7",
			"- [Sony WH-1000XM4](./rtings/over-ear/Sony%20WH-1000XM4) by rtings",
		].join("\n");
		const entries = parseAutoEqIndex(md);
		expect(entries).toHaveLength(3);
		expect(entries[1].source).toBe("crinacle");
		expect(searchAutoEq(entries, "hd 6").map((e) => e.name)).toEqual(["Sennheiser HD 600", "Sennheiser HD 650"]);
		expect(searchAutoEq(entries, "  ")).toEqual([]);
		expect(parametricEqPath(entries[0])).toBe("oratory1990/over-ear/Sennheiser%20HD%20600/Sennheiser%20HD%20600%20ParametricEQ.txt");
	});
});
