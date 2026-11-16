import { describe, expect, it, vi } from "vitest";
import browseLyrics from "../fixtures/browse-lyrics.json";
import nextNoLyrics from "../fixtures/next-no-lyrics.json";
import nextWithLyrics from "../fixtures/next-with-lyrics.json";
import { fetchYtmLyrics, lyricsBrowseId, parseYtmLyrics } from "./ytm-lyrics";

describe("lyricsBrowseId", () => {
	it("finds the Lyrics tab's browse id", () => {
		expect(lyricsBrowseId(nextWithLyrics)).toBe("MPLYt_abc123XYZ-1");
	});
	it("is null when the Lyrics tab is unselectable", () => {
		expect(lyricsBrowseId(nextNoLyrics)).toBeNull();
	});
	it("is null for an unexpected shape", () => {
		expect(lyricsBrowseId({})).toBeNull();
		expect(lyricsBrowseId(null)).toBeNull();
	});
});

describe("parseYtmLyrics", () => {
	it("returns the text and the source without its prefix", () => {
		expect(parseYtmLyrics(browseLyrics)).toEqual({
			text: "First line of the song\nSecond line of the song\nThird line of the song",
			source: "LyricFind",
		});
	});
	it("is null without a description shelf", () => {
		expect(parseYtmLyrics({ contents: {} })).toBeNull();
	});
});

describe("fetchYtmLyrics", () => {
	it("asks /next for the exact video id, then /browse for its lyrics", async () => {
		const fetch = vi.fn(async (path: string) => (path === "/next" ? nextWithLyrics : browseLyrics));
		const res = await fetchYtmLyrics("aaaaaaaaaaa", fetch);
		expect(fetch).toHaveBeenNthCalledWith(1, "/next", expect.objectContaining({ videoId: "aaaaaaaaaaa" }));
		expect(fetch).toHaveBeenNthCalledWith(2, "/browse", { browseId: "MPLYt_abc123XYZ-1" });
		expect(res?.source).toBe("LyricFind");
	});
	it("is null without a lyrics tab, and never calls /browse", async () => {
		const fetch = vi.fn(async () => nextNoLyrics);
		expect(await fetchYtmLyrics("aaaaaaaaaaa", fetch)).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("rejects an invalid video id without a request", async () => {
		const fetch = vi.fn();
		expect(await fetchYtmLyrics("../x", fetch)).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
	it("is null when the request fails", async () => {
		expect(await fetchYtmLyrics("aaaaaaaaaaa", async () => Promise.reject(new Error("offline")))).toBeNull();
	});
});
