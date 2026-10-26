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
const key = (yt: CdpSession, k: string, gesture = false) =>
	yt.eval(`(window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })), true)`, { userGesture: gesture });
/** Pointer events the controls listen for: hover shows the bar, a press gives the player keyboard focus. */
/** A real mouse move or click at the centre of `selector` (hit-tested by Chromium, so covering layers count). */
const mouse = async (yt: CdpSession, type: "mouseMoved" | "click", selector: string) => {
	const r = await yt.eval<{ x: number; y: number }>(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
	if (type === "mouseMoved") return yt.call("Input.dispatchMouseEvent", { type, x: r.x, y: r.y });
	await yt.call("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
	await yt.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
};
const pointer = (yt: CdpSession, type: "pointermove" | "pointerdown", selector: string) =>
	yt.eval(`(document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true })), true)`);
type Media = { t: number; paused: boolean; rate: number; pitch: boolean; muted: boolean; quality: string; levels: string[]; caption: string; pip: boolean; fs: boolean; theater: boolean; full: boolean };
const media = (yt: CdpSession) =>
	yt.eval<Media>(`(() => {
		const v = document.querySelector("video"); const mp = document.querySelector("#movie_player");
		const track = mp.getOption?.("captions", "track") ?? {};
		return { t: v.currentTime, paused: v.paused, rate: v.playbackRate, pitch: v.preservesPitch, muted: mp.isMuted(), quality: mp.getPlaybackQuality(), levels: mp.getAvailableQualityLevels(),
			caption: track.languageCode ?? "", pip: !!document.pictureInPictureElement, fs: document.fullscreenElement === mp, theater: document.documentElement.classList.contains("ytmd-theater"),
			full: mp.getBoundingClientRect().width >= window.innerWidth - 1 };
	})()`);
/** Clicks the entry labelled `label` in the open popup menu. */
const pick = (yt: CdpSession, label: string) =>
	yt.eval<boolean>(`(() => { const b = [...document.querySelectorAll("#ytmd-vc-menu button")].find((e) => e.textContent === ${JSON.stringify(label)}); b?.click(); return !!b; })()`);
const click = (yt: CdpSession, selector: string) => yt.eval<boolean>(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e?.click(); return !!e; })()`);
const until = (yt: CdpSession, test: (m: Media) => boolean, ms: number, what: string) =>
	waitFor(async () => {
		const m = await media(yt);
		return test(m) ? m : false;
	}, ms, what);
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
	{
		id: "s23",
		title: "Video controls: bar on hover; speed, quality, captions, mute, picture-in-picture, theater, fullscreen and YouTube's keys work while the player has focus",
		launch: { settings: { player: { videoMode: "video", videoControls: true } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await mouse(yt, "mouseMoved", "#movie_player");
			await waitFor(async () => (await yt.eval<boolean>(`!!document.querySelector("#movie_player.ytmd-vc-show #ytmd-vc")`)) || false, 10000, "the control bar on a real hover");
			const hit = await yt.eval<string>(`(() => { const b = document.querySelector('#ytmd-vc button[data-name="quality"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e?.closest("#ytmd-vc button")?.dataset.name ?? (e?.tagName + "#" + e?.id); })()`);
			if (hit !== "quality") throw new Error(`the quality button is covered by ${hit}`);

			// Keys do nothing until the player is clicked.
			await pointer(yt, "pointerdown", "ytmusic-nav-bar");
			await key(yt, "k");
			await sleep(400);
			if ((await media(yt)).paused) throw new Error("k paused playback although the player did not have focus");
			await pointer(yt, "pointerdown", "#movie_player video");

			const start = await media(yt);
			await key(yt, "l");
			const fwd = await until(yt, (m) => m.t >= start.t + 9, 5000, "l to seek 10 s forward");
			await key(yt, "j");
			await until(yt, (m) => m.t < fwd.t - 8, 5000, "j to seek 10 s back");

			await key(yt, "<");
			await key(yt, "<");
			await until(yt, (m) => m.rate === 0.5, 3000, "< twice to set 0.5x");
			await key(yt, ">");
			await key(yt, ">");
			await until(yt, (m) => m.rate === 1, 3000, "> twice to return to 1x");

			const { levels } = await media(yt);
			if (levels.includes("hd1080")) {
				const before = (await media(yt)).t;
				await click(yt, '#ytmd-vc button[data-name="quality"]');
				if (!(await pick(yt, "1080p"))) throw new Error(`no 1080p entry in the quality menu (levels ${levels.join(",")})`);
				await until(yt, (m) => m.quality === "hd1080", 15000, "the quality to become 1080p");
				await sleep(1800);
				const after = await media(yt);
				if (after.t + 2 < before) throw new Error(`changing the quality jumped back: ${before.toFixed(1)} -> ${after.t.toFixed(1)}`);
				const res = await t.mainEval<{ prefer?: string }>(`__YTMD_TEST__.services.getProvider("settings").get("player.res")`);
				if (res?.prefer !== "hd1080") throw new Error(`player.res was not saved: ${JSON.stringify(res)}`);
			}

			await key(yt, "c");
			await until(yt, (m) => !!m.caption, 8000, "c to turn captions on");
			await key(yt, "c");
			await until(yt, (m) => !m.caption, 5000, "c to turn captions off");

			await key(yt, "m");
			await until(yt, (m) => m.muted, 3000, "m to mute");
			await key(yt, "m");
			await until(yt, (m) => !m.muted, 3000, "m to unmute");

			await key(yt, "i", true);
			await until(yt, (m) => m.pip, 5000, "i to open picture-in-picture");
			await key(yt, "i", true);
			await until(yt, (m) => !m.pip, 5000, "i to close picture-in-picture");

			await key(yt, "t");
			await until(yt, (m) => m.theater && m.full, 3000, "t to fill the window with the video");
			await key(yt, "Escape");
			await until(yt, (m) => !m.theater, 3000, "Escape to leave theater mode");

			await key(yt, "f", true);
			await until(yt, (m) => m.fs, 5000, "f to enter full screen");
			await key(yt, "f", true);
			await until(yt, (m) => !m.fs, 5000, "f to leave full screen");

			if ((await media(yt)).paused) throw new Error("playback paused during the controls test");
			// A click on the picture pauses and plays, as on YouTube.
			await mouse(yt, "click", "#movie_player");
			await until(yt, (m) => m.paused, 3000, "a click on the video to pause");
			await mouse(yt, "click", "#movie_player");
			await until(yt, (m) => !m.paused, 3000, "a second click to play again");
		},
	},
	{
		id: "s24",
		title: "Output device: the menu lists outputs, choosing the system default keeps playing, and pages cannot open the microphone",
		launch: { settings: { player: { videoMode: "video", outputDevice: "default" } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await waitFor(async () => (await click(yt, "#ytmd-output-button")) || false, 15000, "the audio output button in the player bar");
			const items = await waitFor(async () => {
				const n = await yt.eval<string[]>(`[...document.querySelectorAll("#ytmd-vc-menu button")].map((b) => b.textContent)`);
				return n.length ? n : false;
			}, 5000, "the output device menu");
			if (items[0] !== "System default") throw new Error(`the menu should start with the system default: ${items.join(" | ")}`);
			const before = await media(yt);
			await pick(yt, "System default");
			await sleep(2000);
			const after = await media(yt);
			if (after.paused || after.t <= before.t + 1) throw new Error(`playback stalled after choosing the default device: ${before.t} -> ${after.t}`);
			const sink = await yt.eval<string>(`document.querySelector("video").sinkId`);
			if (sink !== "") throw new Error(`the default device should use the empty sink id, got ${sink}`);
			const mic = await yt.eval<string>(
				`navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((x) => x.stop()); return "granted"; }, (e) => e.name)`,
			);
			if (mic === "granted") throw new Error("the page could open the microphone");
		},
	},
	{
		id: "s25",
		title: "Speed: the player-bar menu sets 1.25x (also in Song mode) and keeps playing; keep pitch flips preservesPitch and is saved",
		launch: { settings: { player: { videoMode: "audio", keepPitch: true } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await waitFor(async () => (await click(yt, "#ytmd-speed-button")) || false, 15000, "the speed button in the player bar");
			if (!(await pick(yt, "1.25×"))) throw new Error("no 1.25x entry in the speed menu");
			const set = await until(yt, (m) => m.rate === 1.25, 5000, "the rate to become 1.25x");
			await sleep(2000);
			const later = await media(yt);
			if (later.paused || later.t < set.t + 2) throw new Error(`playback did not keep going at 1.25x: ${set.t.toFixed(2)} -> ${later.t.toFixed(2)}`);
			if (!later.pitch) throw new Error("preservesPitch should start on");
			await click(yt, "#ytmd-speed-button");
			await yt.eval(`(document.querySelector('#ytmd-vc-menu input[type="checkbox"]').click(), true)`);
			await until(yt, (m) => !m.pitch, 3000, "keep pitch off to clear preservesPitch");
			await waitFor(
				async () => ((await t.mainEval<boolean>(`__YTMD_TEST__.services.getProvider("settings").get("player.keepPitch")`)) === false ? true : false),
				3000,
				"player.keepPitch to be saved",
			);
			const rate = await yt.eval<number>(`document.querySelector("video").playbackRate`);
			if (rate !== 1.25) throw new Error(`the rate changed to ${rate} after the pitch switch`);
		},
	},
];
