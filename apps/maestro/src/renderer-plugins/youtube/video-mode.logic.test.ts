import { describe, expect, it } from "vitest";
import { ATV, decideVideoMode, findTwin, isToggleKey, normalizeVideoMode, playbackContentMode, playingIndex, rowTrack, wrapWithCounterpart } from "./video-mode.logic";

const row = (videoId: string, type: string) => ({
	playlistPanelVideoRenderer: {
		videoId,
		navigationEndpoint: { watchEndpoint: { videoId, watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: type } } } },
	},
});
const wrapped = (primary: ReturnType<typeof row>, counterpart: ReturnType<typeof row>) => ({
	playlistPanelVideoWrapperRenderer: { primaryRenderer: primary, counterpart: [{ counterpartRenderer: counterpart }] },
});
const OMV = "MUSIC_VIDEO_TYPE_OMV";
const queue = [row("other", ATV), wrapped(row("vid", OMV), row("song", ATV))];

describe("findTwin", () => {
	it("finds the song for a playing video and the video for a playing song", () => {
		expect(findTwin(queue, "vid", "audio")?.videoId).toBe("song");
		expect(findTwin(queue, "song", "video")?.videoId).toBe("vid");
	});
	it("returns null without a twin of the wanted kind", () => {
		expect(findTwin(queue, "vid", "video")).toBeNull();
		expect(findTwin(queue, "other", "video")).toBeNull();
		expect(findTwin(null, "vid", "audio")).toBeNull();
	});
});

describe("decideVideoMode", () => {
	const twin = { videoId: "t", endpoint: {} };
	it("audio: swaps to the song, else hides the video; songs stay", () => {
		expect(decideVideoMode("audio", { type: OMV, twin })).toEqual({ kind: "swap", twin });
		expect(decideVideoMode("audio", { type: OMV, twin: null })).toEqual({ kind: "hide-video" });
		expect(decideVideoMode("audio", { type: ATV, twin: null })).toEqual({ kind: "none" });
	});
	it("video: swaps a song to its video, else shows the video", () => {
		expect(decideVideoMode("video", { type: ATV, twin })).toEqual({ kind: "swap", twin });
		expect(decideVideoMode("video", { type: ATV, twin: null })).toEqual({ kind: "none" });
		expect(decideVideoMode("video", { type: OMV, twin: null })).toEqual({ kind: "show-video" });
	});
});

it("normalizes the setting and maps it to YTM's queue mode", () => {
	expect(normalizeVideoMode("audio")).toBe("audio");
	expect(normalizeVideoMode(undefined)).toBe("video");
	expect(playbackContentMode("audio")).toBe("ATV_PREFERRED");
	expect(playbackContentMode("video")).toBe("OMV_PREFERRED");
});

describe("isToggleKey", () => {
	const key = (k: string, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
	const input = { closest: (s: string) => (s.includes("input") ? {} : null) } as unknown as EventTarget;
	const div = { closest: () => null } as unknown as EventTarget;
	it("accepts v/V outside text fields only, without modifiers or repeats", () => {
		expect(isToggleKey(key("v"), div)).toBe(true);
		expect(isToggleKey(key("V"), div)).toBe(true);
		expect(isToggleKey(key("v"), input)).toBe(false);
		expect(isToggleKey(key("v", { ctrlKey: true }), div)).toBe(false);
		expect(isToggleKey(key("v", { repeat: true }), div)).toBe(false);
		expect(isToggleKey(key("b"), div)).toBe(false);
	});
});

describe("wrapWithCounterpart", () => {
	const playing = { playlistPanelVideoRenderer: { ...row("vid", OMV).playlistPanelVideoRenderer, selected: true, menu: {} } };
	playing.playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint = { ...playing.playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint, params: "p", index: 3 } as never;
	const song = { videoId: "song", title: "Song", artist: "Artist", album: "Album", durationSec: 214, type: ATV, art: "https://x=w544-h544" };

	it("pairs the playing row with the found song so YTM can switch between them in place", () => {
		const wrapped = wrapWithCounterpart(playing, song, { primaryDurationSec: 213, startTimeSeconds: 42.7 });
		expect(wrapped).not.toBeNull();
		expect(findTwin([wrapped?.item], "vid", "audio")?.videoId).toBe("song");
		expect(findTwin([wrapped?.item], "song", "video")?.videoId).toBe("vid");
		expect(playingIndex([row("x", ATV), wrapped?.item], "song")).toBe(1);
		expect(wrapped?.watchEndpoint).toMatchObject({ videoId: "song", index: 3, startTimeSeconds: 42 });
		expect(wrapped?.watchEndpoint).not.toHaveProperty("params");
		const counterpart = (wrapped?.item as any).playlistPanelVideoWrapperRenderer.counterpart[0];
		expect(counterpart.segmentMap.segment[0].durationMilliseconds).toBe("213000");
		expect(counterpart.counterpartRenderer.playlistPanelVideoRenderer).toMatchObject({ selected: true, menu: undefined, lengthText: { runs: [{ text: "3:34" }] } });
	});
	it("only wraps plain rows with an endpoint", () => {
		const wrapped = wrapWithCounterpart(playing, song, { primaryDurationSec: 213 });
		expect(wrapped?.watchEndpoint).not.toHaveProperty("startTimeSeconds");
		expect(wrapWithCounterpart(wrapped?.item, song, { primaryDurationSec: 213 })).toBeNull();
		expect(wrapWithCounterpart(null, song, { primaryDurationSec: 213 })).toBeNull();
	});
	it("finds no playing row when nothing is selected", () => {
		expect(playingIndex(queue, "vid")).toBe(-1);
	});
});

it("reads search details from a plain queue row", () => {
	const r = row("vid", OMV);
	const item = { playlistPanelVideoRenderer: { ...r.playlistPanelVideoRenderer, title: { runs: [{ text: "Song" }] }, shortBylineText: { runs: [{ text: "Artist" }] }, lengthText: { runs: [{ text: "3:34" }] } } };
	expect(rowTrack(item)).toEqual({ videoId: "vid", title: "Song", artist: "Artist", durationSec: 214, type: OMV });
	expect(rowTrack(queue[1])).toBeNull();
});
