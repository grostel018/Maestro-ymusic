import { describe, expect, it } from "vitest";
import clear from "./fixtures/search-songs-clear.json";
import { jobFromRow, jobsFromRows } from "./downloads.logic";

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
