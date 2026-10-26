import type { PlayerApi } from "ytm-client-api";
import { getSpeed, onSpeedChange, openSpeedMenu, setSpeed } from "./playback-speed";
import {
	type CaptionTrack,
	type ControlAction,
	captionMenu,
	FRAME_SECONDS,
	formatTime,
	keyAction,
	qualityLabel,
	qualityMenu,
	speedLabel,
	stepSpeed,
} from "./video-controls.logic";
import { closeMenu, isMenuOpen, MENU_CSS, openMenu, setIcon } from "./video-controls.menu";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";
import { resolveYtmStore } from "./ytm-store";

// YouTube-grade video controls (roadmap C2). YTM builds its player without YouTube's control bar (probe
// 2026-10-26: `.ytp-chrome-bottom` is absent, not hidden), so this bar drives the player API: speed, captions,
// quality, loop, picture-in-picture, theater and fullscreen, plus YouTube's keyboard shortcuts while the player
// has focus. Only in Video mode; decisions live in video-controls.logic.ts.

const SETTING = "player.videoControls";
const STYLE_ID = "ytmd-vc-style";
const BAR_ID = "ytmd-vc";
const SHOW = "ytmd-vc-show";
const THEATER = "ytmd-theater";
const AUDIO_VIEW = "ytmd-audio-view";
const HIDE_AFTER_MS = 2500;

const ICONS = {
	play: "M8 5v14l11-7z",
	pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
	captions: "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z",
	quality: "M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.88a.5.5 0 0 0 .12.61l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
	loop: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
	pip: "M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z",
	theater: "M19 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 10H5V8h14v8z",
	fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
	exitFullscreen: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
};

const CSS = `
${MENU_CSS}
#${BAR_ID} { position: absolute; left: 0; right: 0; bottom: 0; z-index: 60; display: flex; align-items: center; gap: 2px; padding: 24px 12px 8px;
	background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); opacity: 0; pointer-events: none; transition: opacity 160ms ease;
	font: 500 13px/1 "YouTube Sans", Roboto, sans-serif; color: #fff; }
#movie_player.${SHOW} #${BAR_ID} { opacity: 1; pointer-events: auto; }
html.${AUDIO_VIEW} #${BAR_ID}, #movie_player.ad-showing #${BAR_ID} { display: none; }
#${BAR_ID} button { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px;
	border-radius: 18px; color: rgba(255, 255, 255, 0.9); }
#${BAR_ID} button:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
#${BAR_ID} button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
#${BAR_ID} button[aria-pressed="true"] { color: #fff; box-shadow: inset 0 -2px 0 #fff; }
#${BAR_ID} button[data-text] { padding: 0 10px; }
#${BAR_ID} svg { width: 22px; height: 22px; fill: currentColor; }
#${BAR_ID} .ytmd-vc-time { padding: 0 8px; font-variant-numeric: tabular-nums; color: rgba(255, 255, 255, 0.85); }
#${BAR_ID} .ytmd-vc-spacer { flex: 1; }
/* Theater: the video fills the window. */
html.${THEATER} #movie_player { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2000 !important; background: #000; }
html.${THEATER} #movie_player video, #movie_player:fullscreen video { left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; object-fit: contain; }
`;

type Player = PlayerApi & {
	addEventListener?: (event: string, handler: () => void) => void;
	removeEventListener?: (event: string, handler: () => void) => void;
	getAvailableQualityLevels?: () => string[];
	getPlaybackQuality?: () => string;
	setPlaybackQualityRange?: (min: string, max?: string) => void;
	loadModule?: (name: string) => void;
	getOption?: (module: string, option: string, args?: unknown) => unknown;
	setOption?: (module: string, option: string, value: unknown) => void;
	isMuted?: () => boolean;
	mute?: () => void;
	unMute?: () => void;
};

function ensureStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = CSS;
	(document.head ?? document.documentElement).appendChild(el);
}

const moviePlayer = () => document.getElementById("movie_player");
const video = () => moviePlayer()?.querySelector("video") ?? null;
const player = () => getPagePlayerApi() as Player | null;
const isVideoMode = () => !document.documentElement.classList.contains(AUDIO_VIEW);
const playerPageOpen = () => !!document.querySelector("ytmusic-app-layout[player-page-open]");

const videoControlsRenderer: RendererPluginRegistration = {
	id: "video-controls",
	enabled: true,
	start(ctx) {
		let enabled = true;
		let focused = false;
		let hideTimer = 0;
		let lastCaption: CaptionTrack | null = null;
		const offs: (() => void)[] = [];

		const theaterOn = () => document.documentElement.classList.contains(THEATER);
		const setTheater = (on: boolean) => {
			document.documentElement.classList.toggle(THEATER, on);
			// The player sizes its <video> from its container; let it re-measure.
			window.dispatchEvent(new Event("resize"));
			render();
		};

		const captionsTrack = (): string => {
			const track = player()?.getOption?.("captions", "track") as { languageCode?: string } | undefined;
			return track?.languageCode ?? "";
		};
		const captionTracks = (): CaptionTrack[] => {
			const p = player();
			p?.loadModule?.("captions");
			return captionMenu(p?.getOption?.("captions", "tracklist", { includeAsr: true }));
		};
		const setCaptions = (track: CaptionTrack | null) => {
			const p = player();
			if (!p) return;
			if (track) {
				p.loadModule?.("captions");
				p.setOption?.("captions", "track", track);
				lastCaption = track;
			} else {
				p.setOption?.("captions", "track", {});
			}
			render();
		};
		const toggleCaptions = () => {
			if (captionsTrack()) return setCaptions(null);
			const tracks = captionTracks();
			const lang = navigator.language.toLowerCase();
			setCaptions(lastCaption ?? tracks.find((t) => t.kind !== "asr" && lang.startsWith(t.languageCode.toLowerCase().split("-")[0])) ?? tracks[0] ?? null);
		};

		const setQuality = (level: string) => {
			const p = player();
			if (!p?.setPlaybackQualityRange) return;
			// A quality change can restart the stream near 0; put the position back if it does.
			const before = p.getCurrentTime();
			p.setPlaybackQualityRange(level, level);
			window.setTimeout(() => {
				if (p.getCurrentTime() + 2 < before) p.seekTo(before);
			}, 1500);
			ctx.ytmd?.settings.set("player.res", { enabled: level !== "auto", prefer: level });
			render();
		};

		const repeatMode = () => resolveYtmStore()?.getState()?.queue?.repeatMode ?? "NONE";
		const toggleLoop = () => {
			resolveYtmStore()?.dispatch({ type: "SET_REPEAT", payload: repeatMode() === "REPEAT_ONE" ? "NONE" : "REPEAT_ONE" });
			render();
		};

		const togglePip = () => {
			const v = video();
			if (!v) return;
			if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
			else void v.requestPictureInPicture().catch((err) => ctx.log.warn("picture-in-picture failed", err));
		};

		const toggleFullscreen = () => {
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
			else void moviePlayer()?.requestFullscreen().catch((err) => ctx.log.warn("fullscreen failed", err));
		};

		const run = (action: ControlAction) => {
			const p = player();
			const v = video();
			switch (action.kind) {
				case "play-pause":
					if (v?.paused) p?.playVideo();
					else p?.pauseVideo();
					break;
				case "seek-by":
					if (p) p.seekTo(Math.max(0, p.getCurrentTime() + action.seconds));
					break;
				case "seek-fraction":
					if (p) p.seekTo(p.getDuration() * action.fraction);
					break;
				case "frame":
					p?.pauseVideo();
					if (v) v.currentTime = Math.max(0, v.currentTime + action.direction * FRAME_SECONDS);
					break;
				case "speed-step":
					setSpeed(stepSpeed(getSpeed(), action.direction));
					break;
				case "fullscreen":
					toggleFullscreen();
					break;
				case "mute":
					if (p?.isMuted?.()) p.unMute?.();
					else p?.mute?.();
					break;
				case "captions":
					toggleCaptions();
					break;
				case "pip":
					togglePip();
					break;
				case "theater":
					setTheater(!theaterOn());
					break;
				case "exit":
					if (theaterOn()) setTheater(false);
					break;
			}
			show();
		};

		const button = (name: string, label: string, onClick: (btn: HTMLButtonElement) => void, icon?: string) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.dataset.name = name;
			btn.title = label;
			btn.setAttribute("aria-label", label);
			if (icon) setIcon(btn, icon);
			else btn.dataset.text = "";
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				onClick(btn);
				show();
			});
			return btn;
		};

		const mount = () => {
			const mp = moviePlayer();
			if (!enabled || !mp || document.getElementById(BAR_ID)) return;
			const bar = document.createElement("div");
			bar.id = BAR_ID;
			const time = document.createElement("span");
			time.className = "ytmd-vc-time";
			const spacer = document.createElement("span");
			spacer.className = "ytmd-vc-spacer";
			bar.append(
				button("play", "Play (k)", () => run({ kind: "play-pause" }), ICONS.play),
				time,
				spacer,
				button("speed", "Playback speed", (btn) => openSpeedMenu(btn)),
				button("captions", "Subtitles (c)", (btn) => {
					const current = captionsTrack();
					const tracks = captionTracks();
					openMenu(btn, "Subtitles", [
						{ label: "Off", checked: !current, onSelect: () => setCaptions(null) },
						...tracks.map((t) => ({ label: t.displayName, checked: t.languageCode === current, onSelect: () => setCaptions(t) })),
					]);
				}, ICONS.captions),
				button("quality", "Quality", (btn) => {
					const p = player();
					const current = p?.getPlaybackQuality?.() ?? "auto";
					openMenu(btn, "Quality", qualityMenu(p?.getAvailableQualityLevels?.()).map((level) => ({
						label: qualityLabel(level),
						checked: level === current,
						onSelect: () => setQuality(level),
					})));
				}, ICONS.quality),
				button("loop", "Loop", toggleLoop, ICONS.loop),
				button("pip", "Picture-in-picture (i)", togglePip, ICONS.pip),
				button("theater", "Theater mode (t)", () => setTheater(!theaterOn()), ICONS.theater),
				button("fullscreen", "Full screen (f)", toggleFullscreen, ICONS.fullscreen),
			);
			// Clicks on the bar must not reach the player (YTM toggles play on a click on the video).
			bar.addEventListener("click", (e) => e.stopPropagation());
			mp.appendChild(bar);
			render();
		};

		const render = () => {
			const bar = document.getElementById(BAR_ID);
			if (!bar) return;
			const v = video();
			const p = player();
			const q = (name: string) => bar.querySelector<HTMLButtonElement>(`button[data-name="${name}"]`);
			const play = q("play");
			if (play) {
				setIcon(play, v && !v.paused ? ICONS.pause : ICONS.play);
				play.title = v && !v.paused ? "Pause (k)" : "Play (k)";
			}
			const time = bar.querySelector(".ytmd-vc-time");
			if (time && p) time.textContent = `${formatTime(p.getCurrentTime())} / ${formatTime(p.getDuration())}`;
			const speed = q("speed");
			if (speed) speed.textContent = speedLabel(getSpeed()).replace("Normal", "1×");
			q("captions")?.setAttribute("aria-pressed", String(!!captionsTrack()));
			q("loop")?.setAttribute("aria-pressed", String(repeatMode() === "REPEAT_ONE"));
			q("pip")?.setAttribute("aria-pressed", String(!!document.pictureInPictureElement));
			q("theater")?.setAttribute("aria-pressed", String(theaterOn()));
			const fs = q("fullscreen");
			if (fs) setIcon(fs, document.fullscreenElement ? ICONS.exitFullscreen : ICONS.fullscreen);
		};

		const hide = () => {
			window.clearTimeout(hideTimer);
			if (isMenuOpen()) return;
			moviePlayer()?.classList.remove(SHOW);
			video()?.removeEventListener("timeupdate", render);
		};
		const show = () => {
			const mp = moviePlayer();
			if (!enabled || !mp || !isVideoMode()) return;
			mount();
			if (!mp.classList.contains(SHOW)) {
				mp.classList.add(SHOW);
				// The time only ticks while the bar is visible.
				video()?.addEventListener("timeupdate", render);
				render();
			}
			window.clearTimeout(hideTimer);
			hideTimer = window.setTimeout(() => {
				if (video()?.paused) return;
				hide();
			}, HIDE_AFTER_MS);
		};

		const onMove = (e: PointerEvent) => {
			if ((e.target as Element | null)?.closest?.("#movie_player")) show();
		};
		const onLeave = (e: PointerEvent) => {
			if (e.target === moviePlayer()) hide();
		};
		// Shortcuts belong to the player once it is clicked, until something else is.
		const onDown = (e: PointerEvent) => {
			const target = e.target as Element | null;
			focused = !!target?.closest?.("#movie_player, #ytmd-vc-menu");
		};
		const onKey = (e: KeyboardEvent) => {
			if (!enabled || !isVideoMode()) return;
			const live = focused || theaterOn() || !!document.fullscreenElement;
			if (!live || (!playerPageOpen() && !theaterOn() && !document.fullscreenElement)) return;
			if (isMenuOpen() && e.key === "Escape") return;
			const action = keyAction(e, e.target);
			if (!action || (action.kind === "exit" && !theaterOn())) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			run(action);
		};
		const onPlayerState = () => render();
		const onFullscreen = () => {
			render();
			window.dispatchEvent(new Event("resize"));
		};

		document.addEventListener("pointermove", onMove, { passive: true });
		document.addEventListener("pointerleave", onLeave, true);
		document.addEventListener("pointerdown", onDown, true);
		window.addEventListener("keydown", onKey, true);
		document.addEventListener("fullscreenchange", onFullscreen);
		offs.push(onSpeedChange(render));

		let attached: Player | null = null;
		const attach = () => {
			const p = player();
			if (!p || p === attached) return;
			attached?.removeEventListener?.("onStateChange", onPlayerState);
			attached = p;
			p.addEventListener?.("onStateChange", onPlayerState);
		};
		// YTM re-creates the player's children now and then; put the bar back (one id lookup, skipped while hidden).
		const remount = window.setInterval(() => {
			if (document.hidden) return;
			attach();
			if (moviePlayer()?.classList.contains(SHOW)) mount();
		}, 2000);

		const setEnabled = (value: unknown) => {
			enabled = value !== false;
			if (!enabled) {
				closeMenu();
				hide();
				setTheater(false);
				document.getElementById(BAR_ID)?.remove();
			}
		};
		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === SETTING) setEnabled(value);
				else if (key === "player") setEnabled((value as { videoControls?: unknown } | null)?.videoControls);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get(SETTING))
			.then(setEnabled)
			.catch(() => undefined);

		ensureStyle();
		attach();

		return () => {
			window.clearInterval(remount);
			window.clearTimeout(hideTimer);
			offSettings();
			for (const off of offs) off();
			attached?.removeEventListener?.("onStateChange", onPlayerState);
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerleave", onLeave, true);
			document.removeEventListener("pointerdown", onDown, true);
			window.removeEventListener("keydown", onKey, true);
			document.removeEventListener("fullscreenchange", onFullscreen);
			closeMenu();
			document.documentElement.classList.remove(THEATER);
			document.getElementById(BAR_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default videoControlsRenderer;
