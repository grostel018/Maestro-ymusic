import { describe, expect, it } from "vitest";
import { captionMenu, clampSpeed, formatTime, keyAction, qualityLabel, qualityMenu, speedLabel, stepSpeed } from "./video-controls.logic";

const key = (k: string, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...extra });
const div = { closest: () => null } as unknown as EventTarget;
const input = { closest: (s: string) => (s.includes("input") ? {} : null) } as unknown as EventTarget;

describe("keyAction", () => {
	it("maps YouTube's shortcuts", () => {
		expect(keyAction(key("k"), div)).toEqual({ kind: "play-pause" });
		expect(keyAction(key(" "), div)).toEqual({ kind: "play-pause" });
		expect(keyAction(key("j"), div)).toEqual({ kind: "seek-by", seconds: -10 });
		expect(keyAction(key("l"), div)).toEqual({ kind: "seek-by", seconds: 10 });
		expect(keyAction(key("ArrowLeft"), div)).toEqual({ kind: "seek-by", seconds: -5 });
		expect(keyAction(key("ArrowRight"), div)).toEqual({ kind: "seek-by", seconds: 5 });
		expect(keyAction(key(","), div)).toEqual({ kind: "frame", direction: -1 });
		expect(keyAction(key("."), div)).toEqual({ kind: "frame", direction: 1 });
		expect(keyAction(key("<"), div)).toEqual({ kind: "speed-step", direction: -1 });
		expect(keyAction(key(">"), div)).toEqual({ kind: "speed-step", direction: 1 });
		expect(keyAction(key("7"), div)).toEqual({ kind: "seek-fraction", fraction: 0.7 });
		for (const [k, kind] of [["f", "fullscreen"], ["m", "mute"], ["c", "captions"], ["i", "pip"], ["t", "theater"], ["Escape", "exit"]]) {
			expect(keyAction(key(k), div)).toEqual({ kind });
		}
	});
	it("leaves modifiers, typing and other keys alone", () => {
		expect(keyAction(key("k", { ctrlKey: true }), div)).toBeNull();
		expect(keyAction(key("k"), input)).toBeNull();
		expect(keyAction(key("v"), div)).toBeNull();
		expect(keyAction(key("x"), null)).toBeNull();
	});
});

describe("speed", () => {
	it("steps through presets, also from custom rates", () => {
		expect(stepSpeed(1, 1)).toBe(1.25);
		expect(stepSpeed(1, -1)).toBe(0.75);
		expect(stepSpeed(1.1, 1)).toBe(1.25);
		expect(stepSpeed(1.1, -1)).toBe(1);
		expect(stepSpeed(2, 1)).toBe(2);
		expect(stepSpeed(0.25, -1)).toBe(0.25);
		expect(stepSpeed(3, 1)).toBe(3);
	});
	it("clamps custom rates and labels them", () => {
		expect(clampSpeed(9)).toBe(4);
		expect(clampSpeed(0)).toBe(0.1);
		expect(clampSpeed(Number.NaN)).toBe(1);
		expect(clampSpeed(1.234)).toBe(1.23);
		expect(speedLabel(1)).toBe("Normal");
		expect(speedLabel(1.5)).toBe("1.5×");
	});
});

describe("quality", () => {
	it("orders the player's levels high to low with auto last", () => {
		expect(qualityMenu(["auto", "tiny", "hd1080", "hd2160", "medium", "weird"])).toEqual(["hd2160", "hd1080", "medium", "tiny", "auto"]);
		expect(qualityMenu(undefined)).toEqual(["auto"]);
		expect(qualityLabel("hd1080")).toBe("1080p");
		expect(qualityLabel("large")).toBe("480p");
	});
});

it("formats times like YouTube", () => {
	expect(formatTime(0)).toBe("0:00");
	expect(formatTime(214.9)).toBe("3:34");
	expect(formatTime(3723)).toBe("1:02:03");
	expect(formatTime(Number.NaN)).toBe("0:00");
});

it("lists caption tracks with auto-generated ones last", () => {
	const tracks = [
		{ languageCode: "en", displayName: "English (auto-generated)", kind: "asr" },
		{ languageCode: "de-DE", displayName: "German (Germany)", kind: "" },
		{ languageCode: "" },
		null,
	];
	expect(captionMenu(tracks).map((t) => t.languageCode)).toEqual(["de-DE", "en"]);
	expect(captionMenu("x")).toEqual([]);
});

it("does not repeat toggles on a held key or take Space from buttons", () => {
	expect(keyAction({ ...key("f"), repeat: true }, div)).toBeNull();
	expect(keyAction({ ...key("l"), repeat: true }, div)).toEqual({ kind: "seek-by", seconds: 10 });
	const button = { closest: (s: string) => (s.includes("button") ? {} : null) } as unknown as EventTarget;
	expect(keyAction(key(" "), button)).toBeNull();
	expect(keyAction(key("k"), button)).toEqual({ kind: "play-pause" });
});
