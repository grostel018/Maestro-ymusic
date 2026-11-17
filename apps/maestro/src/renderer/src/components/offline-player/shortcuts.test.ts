import { describe, expect, it } from "vitest";
import { shortcutAction } from "./shortcuts";

const key = (k: string, shiftKey = false, tagName = "BODY") => ({ key: k, shiftKey, target: { tagName } });

describe("shortcutAction", () => {
	it("Space and k toggle playback", () => {
		expect(shortcutAction(key(" "))).toBe("toggle");
		expect(shortcutAction(key("k"))).toBe("toggle");
	});

	it("arrows seek by 5 s", () => {
		expect(shortcutAction(key("ArrowRight"))).toBe("seek+5");
		expect(shortcutAction(key("ArrowLeft"))).toBe("seek-5");
	});

	it("< and > change speed", () => {
		expect(shortcutAction(key(">", true))).toBe("speed+");
		expect(shortcutAction(key("<", true))).toBe("speed-");
	});

	it("m mutes", () => {
		expect(shortcutAction(key("m"))).toBe("mute");
	});

	it("does nothing while typing", () => {
		expect(shortcutAction(key(" ", false, "INPUT"))).toBeNull();
		expect(shortcutAction(key("k", false, "TEXTAREA"))).toBeNull();
	});

	it("leaves Shift+K (karaoke, online) and other keys alone", () => {
		expect(shortcutAction(key("K", true))).toBeNull();
		expect(shortcutAction(key("x"))).toBeNull();
	});
});
