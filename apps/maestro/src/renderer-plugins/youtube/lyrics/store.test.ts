import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./providers/search", () => ({
	searchLyricsDetailed: vi.fn(async () => ({ result: null })),
}));

import { searchLyricsDetailed } from "./providers/search";
import { createLyricsStore, type LyricsStoreSnapshot } from "./store";
import type { TrackSearchInfo } from "./types";

const A = "aaaaaaaaaaa";
const B = "bbbbbbbbbbb";
const info = (videoId: string) => ({ videoId, title: `Song ${videoId}`, artist: "Artist", durationSec: 200 }) as unknown as TrackSearchInfo;
const opts = { showEvenIfInexact: false };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
	(globalThis as any).document = { querySelector: () => null };
});

describe("lyrics store and YouTube Music's lyrics", () => {
	it("shows YouTube Music's lyrics of the playing song when no provider has any", async () => {
		const store = createLyricsStore({ fetchYtm: async (id) => ({ text: `lyrics of ${id}`, source: "LyricFind" }) });
		await store.fetchForTrack(info(A), opts);
		await flush();
		const snap = store.getSnapshot();
		expect(snap.videoId).toBe(A);
		expect(snap.status).toBe("ready");
		expect(snap.result?.plain).toBe(`lyrics of ${A}`);
	});

	it("never shows the previous song's lyrics on the next song", async () => {
		let releaseA!: () => void;
		const fetchYtm = vi.fn((id: string) =>
			id === A ? new Promise<{ text: string; source: string }>((r) => (releaseA = () => r({ text: "lyrics of A", source: "" }))) : Promise.resolve(null),
		);
		const store = createLyricsStore({ fetchYtm });
		const seen: LyricsStoreSnapshot[] = [];
		store.subscribe((s) => seen.push(s));
		await store.fetchForTrack(info(A), opts);
		store.setLoading(B);
		await store.fetchForTrack(info(B), opts);
		releaseA();
		await flush();
		expect(seen.filter((s) => s.videoId === B).some((s) => s.result?.plain === "lyrics of A")).toBe(false);
		expect(store.getSnapshot()).toMatchObject({ videoId: B, status: "empty" });
	});

	it("does not apply a cached entry to a different song", async () => {
		const store = createLyricsStore({ fetchYtm: async () => null });
		await store.fetchForTrack(info(A), opts);
		expect(store.applyCacheIfPresent(B)).toBe(false);
	});
});

describe("lyrics after a network hiccup", () => {
	it("does not remember 'no lyrics' when the providers failed", async () => {
		vi.useFakeTimers();
		try {
			const search = vi.mocked(searchLyricsDetailed);
			search.mockClear();
			search.mockImplementation(async () => ({ result: null, failed: true }) as never);
			const store = createLyricsStore({ fetchYtm: async () => null });
			await store.fetchForTrack(info(A), opts);
			// both background retries fail too
			await vi.advanceTimersByTimeAsync(6000);
			await vi.advanceTimersByTimeAsync(20000);
			const calls = search.mock.calls.length;
			expect(calls).toBe(3);
			// later (network back): the same song asks the providers again instead of a cached miss
			search.mockImplementation(async () => ({ result: null }) as never);
			await store.fetchForTrack(info(A), opts);
			expect(search.mock.calls.length).toBe(calls + 1);
		} finally {
			vi.mocked(searchLyricsDetailed).mockImplementation(async () => ({ result: null }) as never);
			vi.useRealTimers();
		}
	});
});
