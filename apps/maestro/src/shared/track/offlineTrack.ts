// The offline player's song in the online track shape, so tray, Discord, Last.fm, stats, the API and OBS handle it
// like any other (offline player parity spec). Outside consumers get YouTube's public thumbnail; the field set only grows.
import type { TrackData } from "./trackData";

export type OfflineItem = { videoId: string; title: string; artist: string; album?: string; durationSec?: number };

export function offlineTrackData(item: OfflineItem, startedAt: number): TrackData {
	const duration = Math.round(item.durationSec ?? 0);
	const thumbnail = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
	const thumbs = { thumbnails: [{ url: thumbnail, width: 480, height: 360 }] };
	return {
		video: {
			videoId: item.videoId,
			title: item.title,
			lengthSeconds: String(duration),
			channelId: "",
			isOwnerViewing: false,
			isCrawlable: true,
			thumbnail: thumbs,
			averageRating: 0,
			allowRatings: false,
			viewCount: "0",
			author: item.artist,
			isPrivate: false,
			isUnpluggedCorpus: false,
			musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
			isLiveContent: false,
		},
		context: {
			urlCanonical: `https://music.youtube.com/watch?v=${item.videoId}`,
			title: item.title,
			description: "",
			thumbnail: thumbs,
			siteName: "YouTube Music",
			appName: "YouTube Music",
			androidPackage: "",
			iosAppStoreId: "",
			iosAppArguments: "",
			ogType: "video.other",
			urlApplinksIos: "",
			urlApplinksAndroid: "",
			urlTwitterIos: "",
		} as TrackData["context"],
		meta: { thumbnail, isAudioExclusive: true, startedAt, duration, source: "offline" },
		...(item.album ? { music: { album: item.album } } : {}),
	};
}

/** What the offline player is asked to do. `seek` and `volume` carry absolute values (seconds, 0–100). */
export type OfflineCommand = { command: "play" | "pause" | "next" | "prev" | "seek" | "volume" | "repeat" | "shuffle"; value?: number };

type State = { playing: boolean; progress: number; volume: number };
const clampVol = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * A YouTube Music player command (`api-controls.cmds.ts` names) for the offline player, with the reply the online page
 * would give. `null`: not a playback command, it still goes to the YouTube Music page.
 */
export function offlineCommand(name: string, args: unknown[], s: State): { command: OfflineCommand; reply: unknown } | null {
	const data = (args[0] ?? {}) as { time?: unknown; type?: unknown; volume?: unknown; amount?: unknown };
	const at = (isPlaying: boolean, time = s.progress) => ({ isPlaying, time });
	switch (name) {
		case "play":
			return { command: { command: "play" }, reply: at(true) };
		case "pause":
			return { command: { command: "pause" }, reply: at(false) };
		case "toggle":
			return { command: { command: s.playing ? "pause" : "play" }, reply: at(!s.playing) };
		case "next":
		case "prev":
		case "repeat":
		case "shuffle":
			return { command: { command: name }, reply: at(s.playing) };
		case "seek": {
			const sec = Number(data.time) / 1000;
			if (!Number.isFinite(sec)) return null;
			const value = Math.max(0, data.type === "seek" ? sec : s.progress + sec);
			return { command: { command: "seek", value }, reply: at(s.playing, value) };
		}
		case "volume":
		case "volumeUp":
		case "volumeDown": {
			const amount = Number.isFinite(Number(data.amount)) && data.amount !== undefined ? Number(data.amount) : 5;
			const target = name === "volume" ? Number(data.volume) : s.volume + (name === "volumeUp" ? amount : -amount);
			const value = clampVol(Number.isFinite(target) ? target : s.volume);
			return { command: { command: "volume", value }, reply: { volume: value } };
		}
		default:
			return null;
	}
}
