// Phase C: playback freedom (audio ⇄ video, video controls, output device, speed).
import type { Scenario, TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

const ATV = "MUSIC_VIDEO_TYPE_ATV";
const SONG_URL = "https://music.youtube.com/watch?v=lYBUbBu4W08";

type AvState = {
	t: number;
	paused: boolean;
	quality: string;
	audioView: boolean;
	pressed: string;
	bar: boolean;
	why: string;
	page: boolean;
	/** Playing video id and its type (MUSIC_VIDEO_TYPE_ATV for songs). */
	id: string;
	type: string;
	/** The player-bar cover is square (album art) and loaded. */
	squareCover: boolean;
	/** Rows in the queue plus "Up next". */
	queueLen: number;
	videoDisabled: boolean;
	videoTitle: string;
};

const AV_STATE = `(() => {
	const where = (el) => { if (!el) return "missing"; const r = el.getBoundingClientRect(); return r.width > 0 ? "ok" : "0w in " + (el.parentElement?.id || el.parentElement?.className); };
	const v = document.querySelector("video");
	const api = document.querySelector("#movie_player");
	const pressed = document.querySelector('#ytmd-av-switch button[aria-pressed="true"]');
	const sw = document.getElementById("ytmd-av-switch");
	const bar = document.getElementById("ytmd-av-bar-button");
	const visible = (el) => !!el && el.getBoundingClientRect().width > 0;
	const details = api.getPlayerResponse?.()?.videoDetails ?? {};
	const cover = document.querySelector("ytmusic-player-bar img.image") ?? document.querySelector("ytmusic-player-bar img");
	const store = document.querySelector("#queue")?.queue?.store?.store;
	const q = store?.getState?.()?.queue ?? {};
	const videoBtn = document.querySelector('#ytmd-av-switch button[data-mode="video"]');
	return { id: details.videoId ?? "", type: details.musicVideoType ?? "", squareCover: !!cover && cover.naturalWidth > 0 && cover.naturalWidth === cover.naturalHeight,
		queueLen: (q.items?.length ?? 0) + (q.automixItems?.length ?? 0), videoDisabled: !!videoBtn?.disabled, videoTitle: videoBtn?.title ?? "",
		t: v.currentTime, paused: v.paused, quality: api.getPlaybackQuality(), audioView: document.documentElement.classList.contains("ytmd-audio-view"),
		pressed: visible(sw) && pressed ? pressed.dataset.mode : "", bar: visible(bar), why: where(sw) + " / " + where(bar), page: document.querySelector("ytmusic-app-layout")?.hasAttribute("player-page-open") };
})()`;

const avState = (yt: CdpSession) => yt.eval<AvState>(AV_STATE);
const pressV = (yt: CdpSession) => yt.eval(`(document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true })), true)`);
const videoMode = (t: TestApp) => t.mainEval<string>(`__YTMD_TEST__.services.getProvider("settings").get("player.videoMode")`);

export const scenarios: Scenario[] = [
	{
		id: "s20",
		smoke: true,
		title: "Song/Video switch: always visible, V toggles 5× with no pause or restart, song mode shows the cover, the choice is saved",
		launch: { settings: { player: { videoMode: "video" } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			let seen: AvState | null = null;
			const first = await waitFor(async () => {
				seen = await avState(yt);
				return seen.pressed && seen.bar && seen.t > 4 ? seen : false;
			}, 30000, "the Song/Video switch and the player-bar button to show while playing").catch((err: Error) => {
				throw new Error(`${err.message}; last state ${JSON.stringify(seen)}`);
			});
			if (first.pressed !== "video") throw new Error(`starts in ${first.pressed} mode, expected video`);
			let last = first.t;
			for (let i = 1; i <= 5; i++) {
				await pressV(yt);
				const audio = i % 2 === 1;
				const s = await waitFor(async () => {
					const r = await avState(yt);
					// Song mode plays the found song (C1b) or, without one, shows the cover over the video.
					const songShown = r.audioView || r.type === ATV;
					// While the other version loads the player briefly reports no id and 0 s; wait until it plays.
					return r.pressed === (audio ? "audio" : "video") && songShown === audio && r.id && r.t > 0.5 ? r : false;
				}, 10000, `toggle ${i} to reach ${audio ? "song" : "video"} mode`);
				if (s.paused) throw new Error(`playback paused after toggle ${i}`);
				// Switching versions starts the other one at the whole second it was at, so allow that much.
				if (s.t + 1.5 < last) throw new Error(`position went back after toggle ${i}: ${last.toFixed(2)} → ${s.t.toFixed(2)} (restart?)`);
				last = s.t;
				await sleep(800);
			}
			const audio = await avState(yt);
			if (!audio.audioView && audio.type !== ATV) throw new Error(`song mode should play the song or show the cover: ${JSON.stringify(audio)}`);
			if ((await videoMode(t)) !== "audio") throw new Error("player.videoMode was not saved as audio");
		},
	},
	{
		id: "s21",
		title: "Song mode on a music video finds its song: the song plays near the same position with its square cover, and Up next keeps its length",
		launch: { settings: { player: { videoMode: "video" } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			const before = await waitFor(async () => {
				const r = await avState(yt);
				return r.pressed === "video" && r.t > 4 && r.queueLen > 1 ? r : false;
			}, 30000, "the music video to play with an Up next list");
			if (before.type === ATV) throw new Error(`the test track should be a music video: ${JSON.stringify(before)}`);
			const pressedAt = Date.now();
			await pressV(yt);
			let seen: AvState | null = null;
			const after = await waitFor(async () => {
				seen = await avState(yt);
				return seen.type === ATV && seen.id !== before.id && seen.t > 0 && !seen.paused && seen.squareCover ? seen : false;
			}, 20000, "the song version to play with its square cover").catch((err: Error) => {
				throw new Error(`${err.message}; last state ${JSON.stringify(seen)}`);
			});
			const elapsed = (Date.now() - pressedAt) / 1000;
			if (after.t < before.t - 2 || after.t > before.t + elapsed + 2) {
				throw new Error(`the song started at ${after.t.toFixed(1)} s, expected near ${before.t.toFixed(1)} s (+${elapsed.toFixed(1)} s)`);
			}
			if (after.queueLen !== before.queueLen) throw new Error(`Up next changed length: ${before.queueLen} → ${after.queueLen}`);
			if (after.audioView) throw new Error("the song is playing, so the video cover overlay should be off");
		},
	},
	{
		id: "s22",
		title: "Video mode on a song finds its music video and switches to it, or disables the Video button",
		launch: { settings: { player: { videoMode: "video" } } },
		run: async (t) => {
			await play(t, { url: SONG_URL });
			const yt = await t.view("youtube");
			let seen: AvState | null = null;
			await waitFor(async () => {
				seen = await avState(yt);
				return (seen.type !== ATV && seen.id && !seen.paused) || seen.videoDisabled ? seen : false;
			}, 30000, "the song to switch to its video or the Video button to be disabled").catch((err: Error) => {
				throw new Error(`${err.message}; last state ${JSON.stringify(seen)}`);
			});
		},
	},
];
