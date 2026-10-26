import { describe, expect, it } from "vitest";
import { DEFAULT_AUDIO, normalizeAudio } from "./settings";

describe("normalizeAudio", () => {
	it("fills defaults and clamps ranges", () => {
		expect(normalizeAudio(undefined)).toEqual(DEFAULT_AUDIO);
		const a = normalizeAudio({ eq: { bands: [40, -40], mode: "nope" }, pitch: { semitones: 9.4 }, spatial: { width: 900, crossfeed: "max" } });
		expect(a.eq.bands.slice(0, 3)).toEqual([12, -12, 0]);
		expect(a.eq.mode).toBe("graphic");
		expect(a.pitch.semitones).toBe(6);
		expect(a.spatial).toMatchObject({ width: 200, crossfeed: "off" });
	});

	it("drops broken filters and an AutoEq profile without a name", () => {
		const a = normalizeAudio({ eq: { filters: [{ frequency: 100, gain: 3 }, { gain: 2 }], autoeq: { preamp: -3 } } });
		expect(a.eq.filters).toEqual([{ type: "peaking", frequency: 100, q: 1, gain: 3 }]);
		expect(a.eq.autoeq).toBeNull();
	});
});
