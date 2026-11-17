import { describe, expect, it } from "vitest";
import { collectionFromHeader, jobFromRow, jobsFromPage, jobsFromRows } from "./downloads.logic";
import albumPage from "./fixtures/album-page.json";
import playlistPage from "./fixtures/playlist-page.json";
import clear from "./fixtures/search-songs-clear.json";

const firstRow = () => (clear as any).contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents.find((s: any) => s.musicShelfRenderer).musicShelfRenderer.contents[0];

const queueRow = (over: Record<string, unknown> = {}) => ({
	playlistPanelVideoRenderer: {
		videoId: "lYBUbBu4W08",
		title: { runs: [{ text: "Never Gonna Give You Up" }] },
		shortBylineText: { runs: [{ text: "Rick Astley" }] },
		lengthText: { runs: [{ text: "3:34" }] },
		thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/art=w60-h60" }] },
		navigationEndpoint: { watchEndpoint: { videoId: "lYBUbBu4W08", watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_ATV" } } } },
		...over,
	},
});

describe("jobFromRow", () => {
	it("reads a song row from a list, wrapped or as Polymer's raw data", () => {
		const row = firstRow();
		const expected = { videoId: "lYBUbBu4W08", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", durationSec: 214 };
		expect(jobFromRow(row)).toMatchObject(expected);
		expect(jobFromRow(row.musicResponsiveListItemRenderer)).toMatchObject(expected);
		expect(jobFromRow(row)?.artUrl).toMatch(/^https:\/\//);
	});
	it("reads a queue row", () => {
		expect(jobFromRow(queueRow())).toMatchObject({ videoId: "lYBUbBu4W08", title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 214 });
	});
	it("skips podcast episodes and unknown shapes", () => {
		const episode = queueRow({
			navigationEndpoint: { watchEndpoint: { videoId: "lYBUbBu4W08", watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_PODCAST_EPISODE" } } } },
		});
		expect(jobFromRow(episode)).toBeNull();
		expect(jobFromRow({})).toBeNull();
		expect(jobFromRow(null)).toBeNull();
	});
});

describe("jobsFromRows", () => {
	it("keeps rows with an id, once each", () => {
		const row = firstRow();
		expect(jobsFromRows([row, {}, row, queueRow()]).map((j) => j.videoId)).toEqual(["lYBUbBu4W08"]);
	});
});

describe("album and playlist pages (real responses)", () => {
	it("reads the album from its header", () => {
		expect(collectionFromHeader(albumPage.header, "MPREb_GIfNGta2miN")).toMatchObject({
			id: "MPREb_GIfNGta2miN",
			kind: "album",
			title: "Watch The Throne (Deluxe)",
			artist: "JAŸ-Z & Kanye West",
		});
		expect(collectionFromHeader(albumPage.header, "MPREb_GIfNGta2miN")?.artUrl).toMatch(/^https:\/\//);
	});
	it("reads a playlist from its header, and also from Polymer's raw data", () => {
		const c = collectionFromHeader(playlistPage.header, "VLPL3-sRm8xAzY9Qd1BoHHYFXRMUQlB4BZNt");
		expect(c).toMatchObject({ kind: "playlist", title: "Rap Playlist 2026 - Best Rap Songs - Rap 2026 & Top Rap Songs" });
		expect(collectionFromHeader(playlistPage.header.musicResponsiveHeaderRenderer, "VLx")?.kind).toBe("playlist");
		expect(collectionFromHeader({}, "x")).toBeNull();
	});
	it("gives album songs the album's artist, name and cover, their length and track number", () => {
		const jobs = jobsFromPage(albumPage.header, albumPage.rows, "MPREb_GIfNGta2miN");
		expect(jobs).toHaveLength(3);
		expect(jobs[0]).toMatchObject({
			videoId: "FJt7gNi3Nr4",
			title: "No Church In The Wild (feat. Frank Ocean & The-Dream)",
			artist: "JAŸ-Z & Kanye West",
			album: "Watch The Throne (Deluxe)",
			durationSec: 273,
			trackNumber: 1,
			collection: { id: "MPREb_GIfNGta2miN", kind: "album" },
		});
		expect(jobs[0].artUrl).toMatch(/^https:\/\//);
	});
	it("keeps a playlist song's own artist and cover", () => {
		const [first] = jobsFromPage(playlistPage.header, playlistPage.rows, "VLPL3-sRm8xAzY9Qd1BoHHYFXRMUQlB4BZNt");
		expect(first).toMatchObject({ title: "National Treasures", artist: "Drake", durationSec: 209, collection: { kind: "playlist" } });
		expect(first.album).toBeUndefined();
	});
});
