import { describe, expect, it } from "vitest";
import { fadeOutAt, SilenceTracker, sleepAction, sleepLabel } from "./transitions.logic";

describe("transitions", () => {
	it("starts the fade-out crossfade seconds before the end, not on short tracks", () => {
		expect(fadeOutAt(200, 6)).toBe(194);
		expect(fadeOutAt(200, 0)).toBeNull();
		expect(fadeOutAt(12, 6)).toBeNull();
		expect(fadeOutAt(Number.NaN, 6)).toBeNull();
	});

	it("skips silence only after it lasted 1.5 s, and goes to the next track at the tail", () => {
		const t = new SilenceTracker();
		expect(t.feed(-70, 0, 60, 200)).toBeNull();
		expect(t.feed(-70, 1000, 61, 200)).toBeNull();
		expect(t.feed(-70, 1600, 61.6, 200)).toBe("skip");
		expect(t.feed(-20, 1700, 62, 200)).toBeNull();
		expect(t.feed(-70, 2000, 190, 200)).toBeNull();
		expect(t.feed(-70, 3600, 191, 200)).toBe("next");
		// The first half second of a track never counts (it starts silent while loading).
		t.reset();
		expect(t.feed(-90, 0, 0.1, 200)).toBeNull();
		expect(t.feed(-90, 5000, 0.2, 200)).toBeNull();
	});

	it("sleep timer fades in its last 10 s and then pauses", () => {
		const at = { kind: "at" as const, endsAt: 60_000 };
		expect(sleepAction({ kind: "off" }, 0, 5, false)).toBe("none");
		expect(sleepAction(at, 40_000, 100, false)).toBe("none");
		expect(sleepAction(at, 51_000, 100, false)).toBe("fade");
		expect(sleepAction(at, 52_000, 100, true)).toBe("none");
		expect(sleepAction(at, 59_800, 100, true)).toBe("pause");
		const end = { kind: "end-of-track" as const };
		expect(sleepAction(end, 0, 30, false)).toBe("none");
		expect(sleepAction(end, 0, 8, false)).toBe("fade");
		expect(sleepAction(end, 0, 0.1, true)).toBe("pause");
	});

	it("labels the timer", () => {
		expect(sleepLabel({ kind: "off" }, 0)).toBe("Sleep timer");
		expect(sleepLabel({ kind: "at", endsAt: 15 * 60_000 }, 0)).toBe("Sleep: 15 min");
	});
});
