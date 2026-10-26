import { describe, expect, it } from "vitest";
import { albumFromRenderer, findQueueItem, nextRepeatMode, rendererFor } from "./player-bar";

const album = (title: string, browseId: string) => ({
	text: title,
	navigationEndpoint: {
		browseEndpoint: { browseId, browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" } } },
	},
});
const renderer = (videoId: string, albumTitle?: string) => ({
	videoId,
	longBylineText: { runs: [{ text: "Rick Astley" }, { text: " • " }, ...(albumTitle ? [album(albumTitle, `MPRE${videoId}`)] : [])] },
});
const wrapper = (primary: string, counterpart: string) => ({
	playlistPanelVideoWrapperRenderer: {
		primaryRenderer: { playlistPanelVideoRenderer: renderer(primary) },
		counterpart: [{ counterpartRenderer: { playlistPanelVideoRenderer: renderer(counterpart, "Whenever You Need Somebody") } }],
	},
});

describe("player-bar (store fallback for the ytmusic-miniplayer layout)", () => {
	it("finds the queue entry for a video, including the counterpart of a song/video pair", () => {
		const items = [{ playlistPanelVideoRenderer: renderer("a") }, wrapper("omv", "atv")];
		expect(findQueueItem(items, "a")).toBe(items[0]);
		expect(findQueueItem(items, "atv")).toBe(items[1]);
		expect(findQueueItem(items, "zzz")).toBeNull();
		expect(findQueueItem(items, "")).toBeNull();
	});

	it("picks the renderer of the playing version and reads its album", () => {
		const pair = wrapper("omv", "atv");
		expect(rendererFor(pair, "atv")?.videoId).toBe("atv");
		expect(rendererFor(pair, "omv")?.videoId).toBe("omv");
		expect(albumFromRenderer(rendererFor(pair, "atv"))).toEqual({ id: "MPREatv", title: "Whenever You Need Somebody" });
		expect(albumFromRenderer(rendererFor(pair, "omv"))).toBeUndefined();
		// The classic bar's currentItem is the renderer itself.
		expect(albumFromRenderer(rendererFor(renderer("x", "Album X"), "x"))?.title).toBe("Album X");
	});

	it("steps repeat like YTM's button", () => {
		expect(nextRepeatMode("NONE")).toBe("REPEAT_ALL");
		expect(nextRepeatMode(undefined)).toBe("REPEAT_ALL");
		expect(nextRepeatMode("REPEAT_ALL")).toBe("REPEAT_ONE");
		expect(nextRepeatMode("REPEAT_ONE")).toBe("NONE");
	});
});
