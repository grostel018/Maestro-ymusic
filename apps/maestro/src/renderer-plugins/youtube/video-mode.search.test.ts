import { describe, expect, it, vi } from "vitest";
import nextCounterpart from "./fixtures/next-counterpart.json";
import clear from "./fixtures/search-songs-clear.json";
import { createMatchCache, createVersionFinder, MAX_PINS, NEXT_TTL_MS, SEARCH_HIT_TTL_MS, SEARCH_MISS_TTL_MS, type SearchFetch } from "./video-mode.search";

const DAY = 24 * 60 * 60 * 1000;
/** `/next` knows no pair, so every lookup goes on to `/search` (counted by `search`). */
const searchOnly = (search: SearchFetch): SearchFetch => (path, body) => (path === "/next" ? Promise.resolve({}) : search(path, body));

const memoryStorage = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const match = { videoId: "s", title: "T", artist: "A" };
const rick = { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 213, want: "song" as const };

describe("createMatchCache", () => {
	it("keeps search hits 7 days and misses 1 day, across reloads", () => {
		let now = 1000;
		const storage = memoryStorage();
		const cache = createMatchCache(storage, () => now);
		cache.set("song:a", match, "search");
		cache.set("song:b", null, "search");
		const reloaded = createMatchCache(storage, () => now);
		expect(reloaded.get("song:a")).toEqual(match);
		expect(reloaded.get("song:b")).toBeNull();
		expect(reloaded.get("song:c")).toBeUndefined();
		now += SEARCH_MISS_TTL_MS;
		expect(reloaded.get("song:b")).toBeUndefined();
		expect(reloaded.get("song:a")).toEqual(match);
		now += SEARCH_HIT_TTL_MS;
		expect(reloaded.get("song:a")).toBeUndefined();
	});
	it("keeps YouTube Music's own pairing 30 days", () => {
		let now = 1000;
		const cache = createMatchCache(null, () => now);
		cache.set("song:a", match, "next");
		now += NEXT_TTL_MS - 1;
		expect(cache.get("song:a")).toEqual(match);
		now += 1;
		expect(cache.get("song:a")).toBeUndefined();
		expect(NEXT_TTL_MS).toBe(30 * DAY);
	});
	it("keeps at most MAX_PINS pins, dropping the oldest", () => {
		const storage = memoryStorage();
		const cache = createMatchCache(storage);
		for (let i = 0; i <= MAX_PINS; i++) cache.pin(`video:${i}`);
		const reloaded = createMatchCache(storage);
		expect(reloaded.isPinned("video:0")).toBe(false);
		expect(reloaded.isPinned(`video:${MAX_PINS}`)).toBe(true);
		expect(reloaded.isPinned("video:1")).toBe(true);
	});

	it("pins a wrong video as no video, for good, until unpinned", () => {
		let now = 1000;
		const storage = memoryStorage();
		const cache = createMatchCache(storage, () => now);
		cache.set("video:a", match, "next");
		cache.pin("video:a");
		now += 31 * DAY;
		const reloaded = createMatchCache(storage, () => now);
		expect(reloaded.isPinned("video:a")).toBe(true);
		expect(reloaded.get("video:a")).toBeNull();
		reloaded.unpin("video:a");
		expect(reloaded.isPinned("video:a")).toBe(false);
		expect(reloaded.get("video:a")).toBeUndefined();
	});
	it("ignores the old cache, which may hold wrong picks", () => {
		const storage = memoryStorage();
		storage.setItem("ytmd-av-matches", JSON.stringify({ "song:a": [Date.now(), match] }));
		expect(createMatchCache(storage).get("song:a")).toBeUndefined();
	});
	it("starts empty on unreadable storage", () => {
		const cache = createMatchCache({ getItem: () => "{oops", setItem: () => undefined });
		expect(cache.get("song:a")).toBeUndefined();
	});
});

describe("createVersionFinder", () => {
	it("uses YouTube Music's own pairing first and never searches then", async () => {
		const call = vi.fn<SearchFetch>(async (path) => (path === "/next" ? nextCounterpart : clear));
		const finder = createVersionFinder(() => call, createMatchCache(null));
		expect((await finder.find(rick))?.videoId).toBe("lYBUbBu4W08");
		expect(call).toHaveBeenCalledWith("/next", expect.objectContaining({ videoId: rick.videoId, playlistId: `RDAMVM${rick.videoId}` }));
		expect(call).not.toHaveBeenCalledWith("/search", expect.anything());
	});
	it("searches with the songs filter, matches and caches", async () => {
		const search = vi.fn<SearchFetch>(async () => clear);
		const call = searchOnly(search);
		const finder = createVersionFinder(() => call, createMatchCache(null));
		expect((await finder.find(rick))?.videoId).toBe("lYBUbBu4W08");
		expect(search).toHaveBeenCalledWith("/search", expect.objectContaining({ query: "Never Gonna Give You Up Rick Astley" }));
		expect(finder.peek(rick.videoId, "song")?.videoId).toBe("lYBUbBu4W08");
		await finder.find(rick);
		expect(search).toHaveBeenCalledTimes(1);
	});
	it("keeps one request in flight; a newer waiting request replaces an older one", async () => {
		let release!: () => void;
		const call = vi.fn<SearchFetch>(() => new Promise((resolve) => (release = () => resolve(clear))));
		const finder = createVersionFinder(() => searchOnly(call), createMatchCache(null));
		const first = finder.find(rick);
		const dropped = finder.find({ ...rick, videoId: "x1" });
		const latest = finder.find({ ...rick, videoId: "x2" });
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		release();
		expect((await first)?.videoId).toBe("lYBUbBu4W08");
		expect(await dropped).toBeNull();
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2));
		release();
		expect((await latest)?.videoId).toBe("lYBUbBu4W08");
	});
	it("times out as no match without caching it", async () => {
		vi.useFakeTimers();
		try {
			const call = vi.fn<SearchFetch>(() => new Promise(() => undefined));
			const finder = createVersionFinder(() => call, createMatchCache(null), 4000);
			const pending = finder.find(rick);
			await vi.advanceTimersByTimeAsync(4000);
			expect(await pending).toBeNull();
			expect(finder.peek(rick.videoId, "song")).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});
	it("answers no match for a pinned track without asking, until unpinned", async () => {
		const call = vi.fn<SearchFetch>(async (path) => (path === "/next" ? nextCounterpart : clear));
		const finder = createVersionFinder(() => call, createMatchCache(null));
		finder.pin(rick.videoId, "song");
		expect(finder.isPinned(rick.videoId, "song")).toBe(true);
		expect(await finder.find(rick)).toBeNull();
		expect(call).not.toHaveBeenCalled();
		finder.unpin(rick.videoId, "song");
		expect((await finder.find(rick))?.videoId).toBe("lYBUbBu4W08");
	});
	it("treats errors and a missing client as no match", async () => {
		const failing = createVersionFinder(() => async () => Promise.reject(new Error("net")), createMatchCache(null));
		expect(await failing.find(rick)).toBeNull();
		expect(await createVersionFinder(() => null, createMatchCache(null)).find(rick)).toBeNull();
	});
	it("shares one request when the same track is asked again while busy", async () => {
		let release!: () => void;
		const call = vi.fn<SearchFetch>(() => new Promise((resolve) => (release = () => resolve(clear))));
		const finder = createVersionFinder(() => searchOnly(call), createMatchCache(null));
		const a = finder.find(rick);
		const c1 = finder.find({ ...rick, videoId: "c" });
		const c2 = finder.find({ ...rick, videoId: "c" });
		expect(c1).toBe(c2);
		expect(finder.find(rick)).toBe(a);
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		release();
		await a;
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2));
		release();
		expect((await c1)?.videoId).toBe("lYBUbBu4W08");
	});
});
