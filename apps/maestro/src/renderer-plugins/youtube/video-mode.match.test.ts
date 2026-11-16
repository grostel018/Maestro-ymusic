import { describe, expect, it } from "vitest";
import clear from "./fixtures/search-songs-clear.json";
import live from "./fixtures/search-songs-live.json";
import none from "./fixtures/search-songs-none.json";
import remix from "./fixtures/search-songs-remix.json";
import videos from "./fixtures/search-videos-clear.json";
import nextCounterpart from "./fixtures/next-counterpart.json";
import { largestArt, parseNextCounterpart, parseSearch, pickMatch, type SearchHit } from "./video-mode.match";

const OMV = "MUSIC_VIDEO_TYPE_OMV";
const ATV = "MUSIC_VIDEO_TYPE_ATV";
const hit = (over: Partial<SearchHit>): SearchHit => ({ videoId: "hit00000001", title: "Love Me", artist: "Some Singer", durationSec: 200, type: OMV, ...over });

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
		expect(first.art).toMatch(/=w2048-h2048/);
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
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 400 }, parseSearch(clear), "song")).toBeNull();
	});
	it("reads artist and song from a label upload and allows a music-video intro", () => {
		const hits = parseSearch(clear);
		expect(pickMatch({ title: "Rick Astley - Never Gonna Give You Up (Official Video)", artist: "Some Records", durationSec: 213 }, hits, "song")?.videoId).toBe("lYBUbBu4W08");
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 280 }, hits, "song")?.videoId).toBe("lYBUbBu4W08");
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 334 }, hits, "song")).toBeNull();
		expect(pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 190 }, hits, "song")).toBeNull();
	});
	it("finds the official video of a song, not a remix or a lyric upload", () => {
		const m = pickMatch({ title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 214 }, parseSearch(videos), "video");
		expect(m?.videoId).toBe("dQw4w9WgXcQ");
	});
});

describe("parseNextCounterpart", () => {
	it("reads YouTube Music's own song for a music video", () => {
		expect(parseNextCounterpart(nextCounterpart, "dQw4w9WgXcQ", "song")).toMatchObject({ videoId: "lYBUbBu4W08", type: ATV, durationSec: 214, artist: "Rick Astley" });
	});
	it("reads the music video for a song", () => {
		expect(parseNextCounterpart(nextCounterpart, "lYBUbBu4W08", "video")).toMatchObject({ videoId: "dQw4w9WgXcQ", type: OMV });
	});
	it("is null when the wanted kind is not the counterpart", () => {
		expect(parseNextCounterpart(nextCounterpart, "dQw4w9WgXcQ", "video")).toBeNull();
	});
	it("is null for a track without a pair, and for unexpected shapes", () => {
		expect(parseNextCounterpart(nextCounterpart, "yPYZpwSpKmA", "video")).toBeNull();
		expect(parseNextCounterpart({}, "dQw4w9WgXcQ", "song")).toBeNull();
		expect(parseNextCounterpart(null, "dQw4w9WgXcQ", "song")).toBeNull();
	});
});

describe("pickMatch is strict about the song", () => {
	const song = { title: "Love Me", artist: "Some Singer", durationSec: 200 };
	it("rejects a different song whose title contains this one", () => {
		expect(pickMatch(song, [hit({ title: "Love Me Now" })], "video")).toBeNull();
	});
	it("rejects the same title by a different main artist, even when this artist is featured", () => {
		expect(pickMatch(song, [hit({ artist: "Other Band" })], "video")).toBeNull();
		expect(pickMatch(song, [hit({ artist: "Big Star, Some Singer" })], "video")).toBeNull();
	});
	it("accepts the same main artist with different featured artists", () => {
		expect(pickMatch({ ...song, artist: "Some Singer, Guest" }, [hit({})], "video")?.videoId).toBe("hit00000001");
	});
	it("rejects a video 120 s longer and accepts one 60 s longer", () => {
		expect(pickMatch(song, [hit({ durationSec: 320 })], "video")).toBeNull();
		expect(pickMatch(song, [hit({ durationSec: 260 })], "video")?.videoId).toBe("hit00000001");
	});
	it("rejects a contradicting album", () => {
		expect(pickMatch({ ...song, album: "First Album" }, [hit({ type: ATV, album: "Totally Different Record" })], "song")).toBeNull();
		expect(pickMatch({ ...song, album: "First Album" }, [hit({ type: ATV, album: "First Album" })], "song")?.videoId).toBe("hit00000001");
	});
});

describe("largestArt", () => {
	it("scales googleusercontent art and leaves other urls alone", () => {
		expect(largestArt("https://yt3.googleusercontent.com/x=w60-h60-l90-rj")).toBe("https://yt3.googleusercontent.com/x=w2048-h2048-l90-rj");
		expect(largestArt("https://i.ytimg.com/vi/a/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/a/hqdefault.jpg");
		expect(largestArt(undefined)).toBeUndefined();
	});
});
