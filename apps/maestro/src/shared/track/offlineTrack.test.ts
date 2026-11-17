import { describe, expect, it } from "vitest";
import { offlineCommand, offlineTrackData } from "./offlineTrack";

const item = { videoId: "dQw4w9WgXcQ", title: "Song", artist: "Artist", album: "Album", durationSec: 213 };

describe("offlineTrackData", () => {
	it("fills the online track shape from a download", () => {
		const t = offlineTrackData(item, 1000);
		expect(t.video.videoId).toBe("dQw4w9WgXcQ");
		expect(t.video.title).toBe("Song");
		expect(t.video.author).toBe("Artist");
		expect(t.video.lengthSeconds).toBe("213");
		expect(t.meta.duration).toBe(213);
		expect(t.meta.startedAt).toBe(1000);
		expect(t.meta.thumbnail).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
		expect(t.meta.source).toBe("offline");
		expect(t.music?.album).toBe("Album");
	});

	it("leaves music unset without an album", () => {
		expect(offlineTrackData({ ...item, album: undefined }, 0).music).toBeUndefined();
	});
});

describe("offlineCommand", () => {
	const state = { playing: true, progress: 30, volume: 50 };

	it("maps playback commands and predicts the reply", () => {
		expect(offlineCommand("toggle", [], state)).toEqual({ command: { command: "pause" }, reply: { isPlaying: false, time: 30 } });
		expect(offlineCommand("play", [], { ...state, playing: false })).toEqual({ command: { command: "play" }, reply: { isPlaying: true, time: 30 } });
		expect(offlineCommand("next", [], state)?.command).toEqual({ command: "next" });
		expect(offlineCommand("prev", [], state)?.command).toEqual({ command: "prev" });
	});

	it("turns relative and absolute seeks (milliseconds) into an absolute second", () => {
		expect(offlineCommand("seek", [{ time: 10_000 }], state)?.command).toEqual({ command: "seek", value: 40 });
		expect(offlineCommand("seek", [{ time: -40_000 }], state)?.command).toEqual({ command: "seek", value: 0 });
		expect(offlineCommand("seek", [{ time: 5_000, type: "seek" }], state)?.command).toEqual({ command: "seek", value: 5 });
	});

	it("clamps volume changes to 0–100", () => {
		expect(offlineCommand("volume", [{ volume: 120 }], state)).toEqual({ command: { command: "volume", value: 100 }, reply: { volume: 100 } });
		expect(offlineCommand("volumeUp", [{ amount: 10 }], state)?.reply).toEqual({ volume: 60 });
		expect(offlineCommand("volumeDown", [], state)?.reply).toEqual({ volume: 45 });
	});

	it("leaves plugin commands to the YouTube Music page", () => {
		expect(offlineCommand("enable", [], state)).toBeNull();
		expect(offlineCommand("like", [true], state)).toBeNull();
	});
});
