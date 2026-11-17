import { describe, expect, it } from "vitest";
import { onSongBoundary, sleepAction, sleepLabel } from "./sleep";

describe("sleep timer", () => {
	it("keeps the minutes and end-of-track behaviour", () => {
		const at = { kind: "at" as const, endsAt: 60_000 };
		expect(sleepAction({ kind: "off" }, 0, 5, false)).toBe("none");
		expect(sleepAction(at, 51_000, 100, false)).toBe("fade");
		expect(sleepAction(at, 59_800, 100, true)).toBe("pause");
		expect(sleepAction({ kind: "end-of-track" }, 0, 8, false)).toBe("fade");
	});

	it("after-songs fades only during the last counted song", () => {
		expect(sleepAction({ kind: "after-songs", left: 2 }, 0, 8, false)).toBe("none");
		expect(sleepAction({ kind: "after-songs", left: 1 }, 0, 8, false)).toBe("fade");
		expect(sleepAction({ kind: "after-songs", left: 1 }, 0, 0.1, true)).toBe("pause");
	});

	it("after-songs 2 stops after the second song ends", () => {
		const first = onSongBoundary({ kind: "after-songs", left: 2 }, "ended");
		expect(first).toEqual({ timer: { kind: "after-songs", left: 1 }, stop: false });
		const second = onSongBoundary(first.timer, "ended");
		expect(second.stop).toBe(true);
		expect(second.timer).toEqual({ kind: "off" });
	});

	it("skip counts, previous does not", () => {
		expect(onSongBoundary({ kind: "after-songs", left: 3 }, "skip").timer).toEqual({ kind: "after-songs", left: 2 });
		expect(onSongBoundary({ kind: "after-songs", left: 3 }, "prev")).toEqual({ timer: { kind: "after-songs", left: 3 }, stop: false });
	});

	it("end-of-track stops at the first boundary; minutes ignore boundaries", () => {
		expect(onSongBoundary({ kind: "end-of-track" }, "ended")).toEqual({ timer: { kind: "off" }, stop: true });
		expect(onSongBoundary({ kind: "at", endsAt: 5 }, "ended")).toEqual({ timer: { kind: "at", endsAt: 5 }, stop: false });
	});

	it("labels after-songs", () => {
		expect(sleepLabel({ kind: "after-songs", left: 1 }, 0)).toBe("Sleep: after this song");
		expect(sleepLabel({ kind: "after-songs", left: 3 }, 0)).toBe("Sleep: after 3 songs");
	});
});
