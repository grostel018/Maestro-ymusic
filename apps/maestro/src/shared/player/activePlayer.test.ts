import { describe, expect, it } from "vitest";
import { ActivePlayer, SWITCH_GRACE_MS } from "./activePlayer";

describe("ActivePlayer", () => {
	it("starts online and lets the page report everything", () => {
		const a = new ActivePlayer();
		expect(a.current).toBe("online");
		expect(a.page(false, 0)).toBe("apply");
		expect(a.page(true, 0)).toBe("apply");
	});

	it("the offline player takes over when it plays, remembering the online song", () => {
		const a = new ActivePlayer();
		expect(a.offline(true, 1000, "ytmSongA")).toBe(true);
		expect(a.current).toBe("offline");
		expect(a.offline(true, 1100, "x")).toBe(false); // already active
	});

	it("while offline is active, a paused page is ignored and a playing page takes back over", () => {
		const a = new ActivePlayer();
		a.offline(true, 0, "ytmSongA");
		expect(a.page(false, 5000)).toBe("ignore");
		expect(a.page(true, 5000)).toBe("takeover");
		expect(a.current).toBe("online");
	});

	it("a late report from the player that just lost does not flip it back (grace window)", () => {
		const a = new ActivePlayer();
		a.offline(true, 0, "ytmSongA");
		expect(a.page(true, 5000)).toBe("takeover");
		// offline report already in flight when the page took over
		expect(a.offline(true, 5000 + SWITCH_GRACE_MS - 1, null)).toBe(false);
		expect(a.current).toBe("online");
		expect(a.offline(true, 5000 + SWITCH_GRACE_MS + 1, null)).toBe(true);
		// and the other way: a page progress event in flight when offline took over
		expect(a.page(true, 5000 + SWITCH_GRACE_MS + 2)).toBe("ignore");
	});

	it("closing Downloads hands control back to the page without waiting for it to play", () => {
		const a = new ActivePlayer();
		a.offline(true, 0, "ytmSongA");
		expect(a.downloadsClosed()).toEqual({ released: true, onlineTrackId: "ytmSongA" });
		expect(a.current).toBe("online");
		expect(a.page(false, 10)).toBe("apply");
		expect(a.downloadsClosed()).toEqual({ released: false, onlineTrackId: null });
	});

	it("taking back over returns the online song that was showing before", () => {
		const a = new ActivePlayer();
		a.offline(true, 0, "ytmSongA");
		a.page(true, 5000);
		expect(a.lastReleasedOnlineTrackId).toBe("ytmSongA");
	});
});
