import { describe, expect, it, vi } from "vitest";
import clear from "./fixtures/search-songs-clear.json";
import { CACHE_TTL_MS, createMatchCache, createVersionFinder, type SearchFetch } from "./video-mode.search";

const memoryStorage = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const match = { videoId: "s", title: "T", artist: "A" };
const rick = { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 213, want: "song" as const };

describe("createMatchCache", () => {
	it("keeps hits and misses for 7 days, across reloads", () => {
		let now = 1000;
		const storage = memoryStorage();
		const cache = createMatchCache(storage, () => now);
		cache.set("song:a", match);
		cache.set("song:b", null);
		const reloaded = createMatchCache(storage, () => now);
		expect(reloaded.get("song:a")).toEqual(match);
		expect(reloaded.get("song:b")).toBeNull();
		expect(reloaded.get("song:c")).toBeUndefined();
		now += CACHE_TTL_MS;
		expect(reloaded.get("song:a")).toBeUndefined();
		expect(createMatchCache(storage, () => now).get("song:b")).toBeUndefined();
	});
	it("starts empty on unreadable storage", () => {
		const cache = createMatchCache({ getItem: () => "{oops", setItem: () => undefined });
		expect(cache.get("song:a")).toBeUndefined();
	});
});

describe("createVersionFinder", () => {
	it("searches with the songs filter, matches and caches", async () => {
		const call = vi.fn<SearchFetch>(async () => clear);
		const finder = createVersionFinder(() => call, createMatchCache(null));
		expect((await finder.find(rick))?.videoId).toBe("lYBUbBu4W08");
		expect(call).toHaveBeenCalledWith("/search", expect.objectContaining({ query: "Never Gonna Give You Up Rick Astley" }));
		expect(finder.peek(rick.videoId, "song")?.videoId).toBe("lYBUbBu4W08");
		await finder.find(rick);
		expect(call).toHaveBeenCalledTimes(1);
	});
	it("keeps one request in flight; a newer waiting request replaces an older one", async () => {
		let release!: () => void;
		const call = vi.fn<SearchFetch>(() => new Promise((resolve) => (release = () => resolve(clear))));
		const finder = createVersionFinder(() => call, createMatchCache(null));
		const first = finder.find(rick);
		const dropped = finder.find({ ...rick, videoId: "x1" });
		const latest = finder.find({ ...rick, videoId: "x2" });
		expect(call).toHaveBeenCalledTimes(1);
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
	it("treats errors and a missing client as no match", async () => {
		const failing = createVersionFinder(() => async () => Promise.reject(new Error("net")), createMatchCache(null));
		expect(await failing.find(rick)).toBeNull();
		expect(await createVersionFinder(() => null, createMatchCache(null)).find(rick)).toBeNull();
	});
});
