import { describe, expect, it } from "vitest";
import clear from "./fixtures/search-songs-clear.json";
import live from "./fixtures/search-songs-live.json";
import none from "./fixtures/search-songs-none.json";
import remix from "./fixtures/search-songs-remix.json";
import videos from "./fixtures/search-videos-clear.json";
import { largestArt, parseSearch, pickMatch } from "./video-mode.match";

describe("parseSearch", () => {
	it("reads title, artist, album, length, type and square art from song rows", () => {
		const [first] = parseSearch(clear);
		expect(first).toMatchObject({
			videoId: "lYBUbBu4W08",
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			album: "Whenever You Need Somebody",
			durationSec: 214,
			type: "MUSIC_VIDEO_TYPE_ATV",
		});
		expect(first.art).toMatch(/=w544-h544/);
	});
	it("treats unknown shapes as no results", () => {
		expect(parseSearch(null)).toEqual([]);
		expect(parseSearch({ contents: { tabbedSearchResultsRenderer: { tabs: "x" } } })).toEqual([]);
		const odd = { musicShelfRenderer: { contents: [{}, null] } };
		const response = { contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [odd] } } } }] } } };
		expect(parseSearch(response)).toEqual([]);
	});
});

describe("pickMatch", () => {
	it("finds the song of the test music video", () => {
		const track = { title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)", artist: "Rick Astley", durationSec: 213 };
		expect(pickMatch(track, parseSearch(clear), "song")?.videoId).toBe("lYBUbBu4W08");
	});
	it("prefers the right edit by length and skips cover bands", () => {
		const hits = parseSearch(remix);
		expect(pickMatch({ title: "Avicii - Levels", artist: "AviciiOfficialVEVO", durationSec: 202 }, hits, "song")?.videoId).toBe("xAgv1mAyxr8");
		expect(pickMatch({ title: "Levels", artist: "Avicii", durationSec: 338 }, hits, "song")?.videoId).toBe("wDuoOapZ9Z0");
	});
	it("does not take the original for a remix", () => {
		expect(pickMatch({ title: "Levels (Skrillex Remix)", artist: "Avicii", durationSec: 339 }, parseSearch(remix), "song")).toBeNull();
	});
	it("keeps live and studio versions apart", () => {
		const hits = parseSearch(live);
		expect(pickMatch({ title: "Eagles - Hotel California (Official Audio)", artist: "Eagles", durationSec: 391 }, hits, "song")?.videoId).toBe("BciS5krYL80");
		expect(pickMatch({ title: "Hotel California (Live)", artist: "Eagles", durationSec: 420 }, hits, "song")?.videoId).toBe("g3USq1-vm10");
	});
	it("returns null when nothing matches", () => {
		expect(pickMatch({ title: "zqxjvwk plormf tribbunax", artist: "Nobody", durationSec: 200 }, parseSearch(none), "song")).toBeNull();
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 0 }, parseSearch(clear), "song")).toBeNull();
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 260 }, parseSearch(clear), "song")).toBeNull();
	});
	it("finds the official video of a song, not a remix or a lyric upload", () => {
		const m = pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 214 }, parseSearch(videos), "video");
		expect(m?.videoId).toBe("dQw4w9WgXcQ");
	});
});

describe("largestArt", () => {
	it("scales googleusercontent art and leaves other urls alone", () => {
		expect(largestArt("https://yt3.googleusercontent.com/x=w60-h60-l90-rj")).toBe("https://yt3.googleusercontent.com/x=w544-h544-l90-rj");
		expect(largestArt("https://i.ytimg.com/vi/a/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/a/hqdefault.jpg");
		expect(largestArt(undefined)).toBeUndefined();
	});
});
