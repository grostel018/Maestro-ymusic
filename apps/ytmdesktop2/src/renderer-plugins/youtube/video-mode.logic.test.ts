import { describe, expect, it } from "vitest";
import { ATV, decideVideoMode, findTwin, isToggleKey, normalizeVideoMode, playbackContentMode } from "./video-mode.logic";

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
