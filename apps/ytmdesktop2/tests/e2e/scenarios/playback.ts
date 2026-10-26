// Phase C: playback freedom (audio ⇄ video, video controls, output device, speed).
import type { Scenario, TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

type AvState = { t: number; paused: boolean; quality: string; audioView: boolean; pressed: string; bar: boolean; why: string; page: boolean };

const AV_STATE = `(() => {
	const where = (el) => { if (!el) return "missing"; const r = el.getBoundingClientRect(); return r.width > 0 ? "ok" : "0w in " + (el.parentElement?.id || el.parentElement?.className); };
	const v = document.querySelector("video");
	const api = document.querySelector("#movie_player");
	const pressed = document.querySelector('#ytmd-av-switch button[aria-pressed="true"]');
	const sw = document.getElementById("ytmd-av-switch");
	const bar = document.getElementById("ytmd-av-bar-button");
	const visible = (el) => !!el && el.getBoundingClientRect().width > 0;
	return { t: v.currentTime, paused: v.paused, quality: api.getPlaybackQuality(), audioView: document.documentElement.classList.contains("ytmd-audio-view"),
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
					return r.pressed === (audio ? "audio" : "video") && r.audioView === audio ? r : false;
				}, 10000, `toggle ${i} to reach ${audio ? "song" : "video"} mode`);
				if (s.paused) throw new Error(`playback paused after toggle ${i}`);
				if (s.t + 0.25 < last) throw new Error(`position went back after toggle ${i}: ${last.toFixed(2)} → ${s.t.toFixed(2)} (restart?)`);
				last = s.t;
				await sleep(800);
			}
			const audio = await avState(yt);
			if (!audio.audioView) throw new Error(`song mode should show the cover instead of the video: ${JSON.stringify(audio)}`);
			if ((await videoMode(t)) !== "audio") throw new Error("player.videoMode was not saved as audio");
		},
	},
];
