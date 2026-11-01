import { describe, expect, it } from "vitest";
import { collectIds, mixSmart, parseCsvRows, parsePlaylistFile, shuffled, videoIdFromUrl } from "./parse";

describe("videoIdFromUrl", () => {
	it("reads the usual YouTube links", () => {
		expect(videoIdFromUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x")).toBe("dQw4w9WgXcQ");
		expect(videoIdFromUrl("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
		expect(videoIdFromUrl("https://example.com/song.mp3")).toBeUndefined();
	});
});

describe("parsePlaylistFile", () => {
	it("reads M3U with and without #EXTINF", () => {
		const [p] = parsePlaylistFile(
			"Road trip.m3u8",
			"#EXTM3U\n#EXTINF:213,Rick Astley - Never Gonna Give You Up\nC:\\Music\\a.mp3\nhttps://youtu.be/dQw4w9WgXcQ\n#EXTINF:-1,Solo\nb.mp3\nDaft Punk - One More Time.flac\n",
		);
		expect(p.name).toBe("Road trip");
		expect(p.tracks).toEqual([
			{ artist: "Rick Astley", title: "Never Gonna Give You Up", durationSec: 213 },
			{ artist: "", title: "", videoId: "dQw4w9WgXcQ" },
			{ artist: "", title: "Solo" },
			{ artist: "Daft Punk", title: "One More Time" },
		]);
	});
	it("reads a Spotify CSV export (Exportify), quotes and all", () => {
		const csv = 'Track URI,Track Name,Artist Name(s),Track Duration (ms)\nspotify:1,"Hello, Goodbye",The Beatles,210000\nspotify:2,"Say ""Yes""",A;B,1000\n';
		expect(parsePlaylistFile("list.csv", csv)[0].tracks).toEqual([
			{ title: "Hello, Goodbye", artist: "The Beatles", durationSec: 210 },
			{ title: 'Say "Yes"', artist: "A, B", durationSec: 1 },
		]);
	});
	it("takes video ids from CSV columns", () => {
		expect(parsePlaylistFile("x.csv", "title,url\nA,https://youtu.be/dQw4w9WgXcQ\n")[0].tracks[0].videoId).toBe("dQw4w9WgXcQ");
		expect(parsePlaylistFile("x.csv", "videoId\ndQw4w9WgXcQ\n")[0].tracks[0].videoId).toBe("dQw4w9WgXcQ");
	});
	it("reads Spotify's data download, several playlists in one file", () => {
		const json = JSON.stringify({ playlists: [{ name: "One", items: [{ track: { trackName: "A", artistName: "B" } }] }, { name: "Empty", items: [] }, { name: "Two", items: [{ track: { trackName: "C", artistName: "D" } }] }] });
		const lists = parsePlaylistFile("Playlist1.json", json);
		expect(lists.map((l) => l.name)).toEqual(["One", "Two"]);
		expect(lists[0].tracks).toEqual([{ title: "A", artist: "B" }]);
	});
	it("reads a text file of links and names", () => {
		expect(parsePlaylistFile("x.txt", "https://youtu.be/dQw4w9WgXcQ\n\nA - B\n")[0].tracks).toEqual([
			{ title: "", artist: "", videoId: "dQw4w9WgXcQ" },
			{ title: "B", artist: "A" },
		]);
	});
	it("gives nothing for an empty file and throws on broken JSON", () => {
		expect(parsePlaylistFile("x.csv", "")).toEqual([]);
		expect(() => parsePlaylistFile("x.json", "{oops")).toThrow();
	});
});

describe("parseCsvRows", () => {
	it("handles semicolons and line breaks in quotes", () => {
		expect(parseCsvRows('a;b\n"x\ny";z\n')).toEqual([["a", "b"], ["x\ny", "z"]]);
	});
});

describe("mixSmart", () => {
	it("puts one recommendation after every three songs, none twice", () => {
		expect(mixSmart(["a", "b", "c", "d", "e", "f", "g"], ["r1", "a", "r2", "r3"])).toEqual(["a", "b", "c", "r1", "d", "e", "f", "r2", "g", "r3"]);
	});
	it("plays recommendations when there's little of your own", () => {
		expect(mixSmart(["a"], ["r1", "r2"])).toEqual(["a", "r1", "r2"]);
		expect(mixSmart([], ["r1"])).toEqual(["r1"]);
	});
});

describe("shuffled", () => {
	it("keeps every item and leaves the input alone", () => {
		const input = [1, 2, 3, 4];
		expect(shuffled(input, () => 0).sort()).toEqual([1, 2, 3, 4]);
		expect(input).toEqual([1, 2, 3, 4]);
	});
});

describe("collectIds", () => {
	it("finds ids under the renderer at any depth", () => {
		const res = { a: [{ playlistPanelVideoRenderer: { videoId: "x" } }, { b: { musicResponsiveListItemRenderer: { playlistItemData: { videoId: "y" } } } }] };
		expect(collectIds(res, "playlistPanelVideoRenderer")).toEqual(["x"]);
		expect(collectIds(res, "musicResponsiveListItemRenderer")).toEqual(["y"]);
	});
});
