// Phase C: playback freedom (audio ⇄ video, video controls, output device, speed).
import path from "node:path";
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
// Every input below is real: Chromium hit-tests mouse events and routes key events like a user's, so a control that
// something covers, or a key the page swallows, fails here as it would for the owner.
const KEYS: Record<string, { code: string; vk: number; text?: string; shift?: boolean }> = {
	Escape: { code: "Escape", vk: 27 },
	"<": { code: "Comma", vk: 188, text: "<", shift: true },
	">": { code: "Period", vk: 190, text: ">", shift: true },
};
const key = async (yt: CdpSession, k: string) => {
	const d = KEYS[k] ?? { code: `Key${k.toUpperCase()}`, vk: k.toUpperCase().charCodeAt(0), text: k };
	const modifiers = d.shift ? 8 : 0;
	await yt.call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: d.code, windowsVirtualKeyCode: d.vk, modifiers });
	if (d.text) await yt.call("Input.dispatchKeyEvent", { type: "char", key: k, code: d.code, text: d.text, windowsVirtualKeyCode: d.vk, modifiers });
	await yt.call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: d.code, windowsVirtualKeyCode: d.vk, modifiers });
	await sleep(150);
};
const pressV = (yt: CdpSession) => key(yt, "v");
/** Centre of `selector` and whether a real click there would reach it (nothing on top). */
const spot = (yt: CdpSession, selector: string) =>
	yt.eval<{ x: number; y: number; reach: boolean; on: string } | null>(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
		const b = e.getBoundingClientRect(); if (!b.width) return null; const x = b.left + b.width / 2, y = b.top + b.height / 2; const h = document.elementFromPoint(x, y);
		return { x, y, reach: !!h && (h === e || e.contains(h)), on: h ? h.tagName.toLowerCase() + (h.id ? "#" + h.id : "") : "nothing" }; })()`);
/** A real mouse move or click at the centre of `selector`. */
const mouse = async (yt: CdpSession, type: "mouseMoved" | "click", selector: string) => {
	const r = await spot(yt, selector);
	if (!r) throw new Error(`${selector} is not on screen`);
	if (type === "mouseMoved") return yt.call("Input.dispatchMouseEvent", { type, x: r.x, y: r.y });
	await yt.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
	await yt.call("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
	await yt.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
};
/** A real click on `selector`: false while it isn't there yet; an error when something covers it. */
const click = async (yt: CdpSession, selector: string): Promise<boolean> => {
	const r = await spot(yt, selector);
	if (!r) return false;
	if (!r.reach) throw new Error(`${selector} is covered by ${r.on}`);
	await mouse(yt, "click", selector);
	await sleep(300);
	return true;
};
type Media = { t: number; paused: boolean; rate: number; pitch: boolean; muted: boolean; quality: string; levels: string[]; caption: string; pip: boolean; fs: boolean; theater: boolean; onScreen: boolean; playerW: number; videoH: number; sidePanel: boolean };
const media = (yt: CdpSession) =>
	yt.eval<Media>(`(() => {
		const v = document.querySelector("video"); const mp = document.querySelector("#movie_player");
		const track = mp.getOption?.("captions", "track") ?? {};
		return { t: v.currentTime, paused: v.paused, rate: v.playbackRate, pitch: v.preservesPitch, muted: mp.isMuted(), quality: mp.getPlaybackQuality(), levels: mp.getAvailableQualityLevels(),
			caption: track.languageCode ?? "", pip: !!document.pictureInPictureElement, fs: !!document.fullscreenElement, theater: document.documentElement.classList.contains("ytmd-theater"),
			// What the owner sees: the player inside the window, a picture with height, the Up next panel shown or not.
			onScreen: (() => { const r = mp.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
			playerW: Math.round(mp.getBoundingClientRect().width), videoH: Math.round(v.getBoundingClientRect().height),
			sidePanel: (document.querySelector("ytmusic-player-page #side-panel")?.getBoundingClientRect().width ?? 0) > 0 };
	})()`);
/** Really clicks the entry labelled `label` in the open popup menu. */
const pick = async (yt: CdpSession, label: string) => {
	const i = await yt.eval<number>(`[...document.querySelectorAll("#ytmd-vc-menu button")].findIndex((e) => e.textContent === ${JSON.stringify(label)})`);
	return i >= 0 && click(yt, `#ytmd-vc-menu button:nth-of-type(${i + 1})`);
};
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
		id: "s32",
		title: "Theater and full screen with real clicks: the picture fills the player, centred; Up next isn't seen behind it",
		launch: { settings: { player: { videoMode: "video", videoControls: true } } },
		run: async (t) => {
			await t.mainEval(`(() => { const win = __YTMD_TEST__.getMainWindow().main; if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 1, y: 0, width: 1870, height: 980 }); })()`);
			await play(t);
			const yt = await t.view("youtube");
			const shot = (name: string) => yt.screenshot(path.join(import.meta.dirname, "..", "results", `s32-${name}.png`));
			type Fit = { video: number[]; movie: number[]; bg: string; vc: number[] | null; bar: number[] | null };
			const fit = () =>
				yt.eval<Fit>(`(() => {
					const box = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [b.left, b.top, b.right, b.bottom] : null; };
					return { video: box("video"), movie: box("#movie_player"), bg: getComputedStyle(document.querySelector("#movie_player")).backgroundColor, vc: box("#ytmd-vc"), bar: box("ytmusic-player-bar") };
				})()`);
			/** The picture's box fills the player even when YouTube left a stale size on <video> (587x330, as the owner saw). */
			const expectFills = async (what: string) => {
				await yt.eval(`Object.assign(document.querySelector("video").style, { width: "587px", height: "330px" })`);
				const f = await fit();
				if (f.video.some((v, i) => Math.abs(v - f.movie[i]) > 1)) throw new Error(`${what}: video ${f.video} doesn't fill the player ${f.movie}`);
			};
			const hover = async () => {
				await mouse(yt, "mouseMoved", "ytmusic-player-page #side-panel");
				await mouse(yt, "mouseMoved", "#movie_player");
				await waitFor(async () => (await yt.eval<boolean>(`!!document.querySelector("#movie_player.ytmd-vc-show #ytmd-vc")`)) || false, 5000, "the control bar on a real hover");
			};
			await expectFills("normal view");
			await hover();
			await click(yt, '#ytmd-vc button[data-name="theater"]');
			await until(yt, (m) => m.theater && !m.sidePanel, 3000, "theater to hide Up next");
			await expectFills("theater");
			await shot("theater");
			await mouse(yt, "mouseMoved", "#movie_player");
			await sleep(300);
			await click(yt, '#ytmd-vc button[data-name="theater"]');
			await until(yt, (m) => !m.theater && m.sidePanel, 3000, "theater to close");
			await expectFills("after theater");
			await hover();
			await click(yt, '#ytmd-vc button[data-name="fullscreen"]');
			await until(yt, (m) => m.fs, 5000, "full screen");
			await sleep(1000);
			await mouse(yt, "mouseMoved", "#movie_player");
			await sleep(500);
			await expectFills("full screen");
			const f = await fit();
			if (f.bg !== "rgb(0, 0, 0)") throw new Error(`the page shows through the bars beside the picture: player background ${f.bg}`);
			if (f.vc && f.bar && f.vc[3] > f.bar[1] + 1) throw new Error(`the video bar (to ${f.vc[3]}) overlaps the player bar (from ${f.bar[1]})`);
			// A picture narrower than the screen, like the owner's 4:3 video, for a look at the sides.
			await yt.eval(`document.querySelector("video").style.objectFit = "none"`);
			await sleep(300);
			await shot("fullscreen-gap");
			await yt.eval(`document.querySelector("video").style.objectFit = ""`);
			await key(yt, "f");
			await until(yt, (m) => !m.fs && !m.paused, 5000, "leaving full screen, still playing");
		},
	},
	{
		id: "s32b",
		title: "A track started in Song mode and switched to Video with a real click shows its picture filling the player",
		launch: { settings: { player: { videoMode: "audio", videoControls: true } } },
		run: async (t) => {
			await t.mainEval(`(() => { const win = __YTMD_TEST__.getMainWindow().main; if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 1, y: 0, width: 1870, height: 980 }); })()`);
			await play(t);
			const yt = await t.view("youtube");
			await waitFor(async () => (await click(yt, '#ytmd-av-switch button[data-mode="video"]')) || false, 10000, "the Video button");
			await until(yt, (m) => !m.paused, 10000, "playing after the switch");
			await sleep(2000);
			const seen = await yt.eval<{ inline: string | null; video: number[]; movie: number[]; audioView: boolean }>(`(() => {
				const box = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
				return { inline: document.querySelector("video").getAttribute("style"), video: box("video"), movie: box("#movie_player"), audioView: document.documentElement.classList.contains("ytmd-audio-view") };
			})()`);
			// The inline size is YouTube's own; it shows whether the player went stale (the CSS covers it either way).
			console.log(`  s32b: inline "${seen.inline}", video ${seen.video}, player ${seen.movie}`);
			if (seen.audioView) throw new Error("still in Song mode after clicking Video");
			if (seen.video.some((v, i) => Math.abs(v - seen.movie[i]) > 1)) throw new Error(`video ${seen.video} doesn't fill the player ${seen.movie}`);
			await yt.screenshot(path.join(import.meta.dirname, "..", "results", "s32b-switched.png"));
		},
	},
	{
		id: "s33",
		title: "Full screen hides the player bar while the mouse is still and shows it on a move; at 800 px the switch clears the picture, the close-player button stays in the window, lyrics fit above the player bar and the cover clears the tabs",
		launch: { settings: { player: { videoMode: "video", videoControls: true }, lyrics: { enabled: true } } },
		run: async (t) => {
			await t.mainEval(`(() => { const win = __YTMD_TEST__.getMainWindow().main; if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 1, y: 0, width: 1500, height: 900 }); })()`);
			await play(t);
			const yt = await t.view("youtube");
			const barOpacity = () => yt.eval<number>(`Number(getComputedStyle(document.querySelector("ytmusic-player-bar")).opacity)`);
			await mouse(yt, "mouseMoved", "#movie_player");
			await key(yt, "f");
			await until(yt, (m) => m.fs, 5000, "full screen");
			await yt.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 960, y: 400 });
			await sleep(500);
			await waitFor(async () => (await barOpacity()) === 0 || false, 10000, "the player bar to hide with the mouse still");
			await sleep(1000);
			await yt.screenshot(path.join(import.meta.dirname, "..", "results", "s33-fullscreen-still.png"));
			await yt.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900, y: 500 });
			await yt.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 940, y: 520 });
			await waitFor(async () => (await barOpacity()) > 0.9 || false, 3000, "the player bar to show on a mouse move");
			await key(yt, "f");
			await until(yt, (m) => !m.fs && !m.paused, 5000, "leaving full screen, still playing");
			if ((await barOpacity()) !== 1) throw new Error("the player bar stays hidden after full screen");
			for (const width of [1000, 800]) {
				await t.mainEval(`__YTMD_TEST__.getMainWindow().main.setBounds({ x: 1, y: 0, width: ${width}, height: 900 })`);
				await sleep(1500);
				const m = await yt.eval<{ inner: number; switchBottom: number; playerTop: number; playerH: number; close: number }>(`(() => {
					const r = (s) => document.querySelector(s).getBoundingClientRect();
					// One more button: the sing button joins the bar when a track has synced lyrics.
					const extra = document.querySelector("#ytmd-av-bar-button").cloneNode(true);
					extra.id = "s33-extra";
					document.querySelector("#ytmd-av-bar-button").after(extra);
					const close = r("ytmusic-player-bar .toggle-player-page-button").right;
					extra.remove();
					return { inner: innerWidth, switchBottom: r("#ytmd-av-switch").bottom, playerTop: r("ytmusic-player").top, playerH: r("ytmusic-player").height, close };
				})()`);
				console.log(`  s33 ${width}: ${JSON.stringify(m)}`);
				if (m.switchBottom > m.playerTop) throw new Error(`at ${width} px the switch (to ${m.switchBottom}) covers the picture (from ${m.playerTop})`);
				if (m.playerH < 150) throw new Error(`at ${width} px the player is ${m.playerH} px tall`);
				if (m.close > m.inner) throw new Error(`at ${width} px the close-player button ends at ${m.close} in a ${m.inner} px window`);
				await yt.screenshot(path.join(import.meta.dirname, "..", "results", `s33-w${width}.png`));
			}
			// The smallest window: the track title stays between the toolbar's buttons.
			await t.mainEval(`__YTMD_TEST__.getMainWindow().main.setBounds({ x: 1, y: 0, width: 640, height: 900 })`);
			await sleep(800);
			const tb = await t.view("toolbar");
			const crowd = await tb.eval<{ pillLeft: number; pillRight: number; leftEnd: number; rightStart: number }>(`(() => {
				const pill = document.querySelector('button[title="Open the player"]')?.getBoundingClientRect();
				const buttons = [...document.querySelectorAll("button")].filter((b) => b.title !== "Open the player").map((b) => b.getBoundingClientRect()).filter((b) => b.width);
				return { pillLeft: pill?.left ?? 0, pillRight: pill?.right ?? 0, leftEnd: Math.max(...buttons.filter((b) => b.left < innerWidth / 3).map((b) => b.right)), rightStart: Math.min(...buttons.filter((b) => b.left >= innerWidth / 3).map((b) => b.left)) };
			})()`);
			console.log(`  s33 toolbar 640: ${JSON.stringify(crowd)}`);
			if (crowd.pillRight > crowd.rightStart || crowd.pillLeft < crowd.leftEnd) throw new Error(`the track title overlaps the toolbar's buttons: ${JSON.stringify(crowd)}`);
			await tb.screenshot(path.join(import.meta.dirname, "..", "results", "s33-toolbar-640.png"));
			// Lyrics with Up next's tabs below the player: the view fits above the player bar, or the lines end up under it.
			await t.mainEval(`__YTMD_TEST__.getMainWindow().main.setBounds({ x: 1, y: 0, width: 800, height: 1000 })`);
			await sleep(1000);
			await yt.eval(`[...document.querySelectorAll("ytmusic-player-page tp-yt-paper-tab")].find((e) => e.textContent.trim().toLowerCase() === "lyrics")?.click()`);
			const fit = await waitFor(
				async () => {
					const l = await yt.eval<{ bottom: number; barTop: number; line: number } | null>(`(() => {
						const root = document.querySelector("#ytmd-lyrics-root"); if (!root || !root.getBoundingClientRect().height) return null;
						const line = document.querySelector('.ytmd-al-line[data-d="0"], .ytmd-al-dots[data-d="0"]');
						return line ? { bottom: root.getBoundingClientRect().bottom, barTop: document.querySelector("ytmusic-player-bar").getBoundingClientRect().top, line: line.getBoundingClientRect().bottom } : null;
					})()`);
					return l ?? false;
				},
				15000,
				"the lyrics view with a current line",
			);
			console.log(`  s33 lyrics: ${JSON.stringify(fit)}`);
			if (fit.bottom > fit.barTop + 1) throw new Error(`the lyrics view ends at ${fit.bottom}, under the player bar at ${fit.barTop}`);
			if (fit.line > fit.barTop) throw new Error(`the current line ends at ${fit.line}, under the player bar at ${fit.barTop}`);
			await yt.screenshot(path.join(import.meta.dirname, "..", "results", "s33-lyrics-800.png"));
			await yt.eval(`[...document.querySelectorAll("ytmusic-player-page tp-yt-paper-tab")].find((e) => e.textContent.trim().toLowerCase() === "up next")?.click()`);
			// Song mode beside and above Up next: the cover clears the switch and the tabs.
			await key(yt, "v");
			await sleep(3000);
			for (const width of [1100, 800]) {
				await t.mainEval(`__YTMD_TEST__.getMainWindow().main.setBounds({ x: 1, y: 0, width: ${width}, height: 1000 })`);
				await sleep(1500);
				const c = await yt.eval<{ coverTop: number; coverBottom: number; switchBottom: number; tabsTop: number }>(`(() => {
					const r = (s) => document.querySelector(s).getBoundingClientRect();
					return { coverTop: r("ytmusic-player").top, coverBottom: r("ytmusic-player").bottom, switchBottom: r("#ytmd-av-switch").bottom, tabsTop: r("ytmusic-player-page tp-yt-paper-tabs").top };
				})()`);
				console.log(`  s33 song ${width}: ${JSON.stringify(c)}`);
				if (width === 800 && c.coverBottom > c.tabsTop) throw new Error(`the cover (to ${c.coverBottom}) runs into the tabs (from ${c.tabsTop})`);
				if (width === 800 && c.switchBottom > c.coverTop) throw new Error(`the switch (to ${c.switchBottom}) covers the cover (from ${c.coverTop})`);
				await yt.screenshot(path.join(import.meta.dirname, "..", "results", `s33-song-${width}.png`));
			}
		},
	},
	{
		id: "s23",
		title: "Video controls with a real mouse and keys: the bar shows on hover and nothing covers it; a click pauses and plays; quality changes the picture; theater enlarges it on screen; full screen fills the screen; YouTube's keys work",
		launch: { settings: { player: { videoMode: "video", videoControls: true } } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			const hover = async () => {
				await mouse(yt, "mouseMoved", "ytmusic-player-page #side-panel");
				await mouse(yt, "mouseMoved", "#movie_player");
				await waitFor(async () => (await yt.eval<boolean>(`!!document.querySelector("#movie_player.ytmd-vc-show #ytmd-vc")`)) || false, 5000, "the control bar on a real hover");
			};
			await hover();
			for (const name of ["captions", "quality", "pip", "theater", "fullscreen"]) {
				const r = await spot(yt, `#ytmd-vc button[data-name="${name}"]`);
				if (!r?.reach) throw new Error(`the ${name} button is ${r ? `covered by ${r.on}` : "missing"}`);
			}
			const dupes = await yt.eval<string[]>(`["play", "speed", "loop"].filter((n) => document.querySelector('#ytmd-vc button[data-name="' + n + '"]'))`);
			if (dupes.length) throw new Error(`the video bar repeats player-bar controls: ${dupes.join(", ")}`);

			// A click on the picture pauses and plays, as on YouTube, and gives the player the keys.
			await mouse(yt, "click", "#movie_player");
			await until(yt, (m) => m.paused, 3000, "a click on the video to pause");
			await mouse(yt, "click", "#movie_player");
			await until(yt, (m) => !m.paused, 3000, "a second click to play again");
			// YTM's own player used to toggle too, which left it paused a moment later.
			await sleep(1500);
			if ((await media(yt)).paused) throw new Error("second click paused playback");

			const start = await media(yt);
			await key(yt, "l");
			const fwd = await until(yt, (m) => m.t >= start.t + 9, 5000, "l to seek 10 s forward");
			await key(yt, "j");
			await until(yt, (m) => m.t < fwd.t - 8, 5000, "j to seek 10 s back");
			if ((await media(yt)).paused) throw new Error("j paused playback");

			await key(yt, "<");
			await key(yt, "<");
			await until(yt, (m) => m.rate === 0.5, 3000, "< twice to set 0.5x");
			await key(yt, ">");
			await key(yt, ">");
			await until(yt, (m) => m.rate === 1, 3000, "> twice to return to 1x");
			if ((await media(yt)).paused) throw new Error("< and > paused playback");

			const { levels } = await media(yt);
			if (levels.includes("hd1080")) {
				const before = (await media(yt)).t;
				await hover();
				await click(yt, '#ytmd-vc button[data-name="quality"]');
				if (!(await pick(yt, "1080p"))) throw new Error(`no 1080p entry in the quality menu (levels ${levels.join(",")})`);
				await until(yt, (m) => m.quality === "hd1080", 15000, "the quality to become 1080p");
				await waitFor(async () => (await yt.eval<number>(`document.querySelector("video").videoHeight`)) === 1080 || false, 15000, "the picture to be 1080 lines");
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
			if ((await media(yt)).paused) throw new Error("c paused playback");

			await key(yt, "m");
			await until(yt, (m) => m.muted, 3000, "m to mute");
			await key(yt, "m");
			await until(yt, (m) => !m.muted, 3000, "m to unmute");
			if ((await media(yt)).paused) throw new Error("m paused playback");

			await key(yt, "i");
			await until(yt, (m) => m.pip, 5000, "i to open picture-in-picture");
			if ((await media(yt)).paused) throw new Error("i (picture-in-picture on) paused playback");
			await key(yt, "i");
			await until(yt, (m) => !m.pip, 5000, "i to close picture-in-picture");
			if ((await media(yt)).paused) throw new Error("i (picture-in-picture off) paused playback");

			// Theater from the button: Up next goes away and a bigger picture stays on screen.
			const normal = await media(yt);
			await hover();
			await click(yt, '#ytmd-vc button[data-name="theater"]');
			await until(yt, (m) => m.theater && !m.sidePanel && m.onScreen && m.playerW > normal.playerW + 100 && m.videoH > 300, 3000, "theater to hide Up next and enlarge the picture on screen");
			if ((await media(yt)).paused) throw new Error("theater button paused playback");
			await key(yt, "Escape");
			await until(yt, (m) => !m.theater && m.sidePanel, 3000, "Escape to leave theater mode");
			if ((await media(yt)).paused) throw new Error("Escape from theater paused playback");
			await key(yt, "t");
			await until(yt, (m) => m.theater && m.onScreen && m.videoH > 300, 3000, "t to open theater");
			if ((await media(yt)).paused) throw new Error("t (theater on) paused playback");
			await key(yt, "t");
			await until(yt, (m) => !m.theater, 3000, "t to close theater");
			if ((await media(yt)).paused) throw new Error("t (theater off) paused playback");

			// Full screen from the button and from f: the picture fills the screen (it went black before).
			await hover();
			await click(yt, '#ytmd-vc button[data-name="fullscreen"]');
			await until(yt, (m) => m.fs && m.videoH > 600, 5000, "the full-screen button to show the picture full size");
			if ((await media(yt)).paused) throw new Error("full-screen button paused playback");
			await key(yt, "Escape");
			await until(yt, (m) => !m.fs, 5000, "Escape to leave full screen");
			if ((await media(yt)).paused) throw new Error("Escape from full screen paused playback");
			await key(yt, "f");
			await until(yt, (m) => m.fs && m.videoH > 600, 5000, "f to show the picture full screen");
			if ((await media(yt)).paused) throw new Error("f (full screen on) paused playback");
			await key(yt, "f");
			await until(yt, (m) => !m.fs, 5000, "f to leave full screen");
			if ((await media(yt)).paused) throw new Error("f (full screen off) paused playback");

			if ((await media(yt)).paused) throw new Error("playback paused during the controls test");
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
			await click(yt, '#ytmd-vc-menu input[type="checkbox"]');
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
