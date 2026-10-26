import type { PlayerApi } from "ytm-client-api";
import { dispatchYtNavigate } from "./api-controls.cmds";
import { decideVideoMode, findTwin, isToggleKey, normalizeVideoMode, playbackContentMode, type VideoMode } from "./video-mode.logic";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";
import { resolveYtmStore } from "./ytm-store";

// Audio ⇄ video (roadmap C1). One setting, `player.videoMode`, flipped by our Song/Video switch on the player page,
// a player-bar button, or `V`. YTM's own switch is Premium-only (disabled otherwise), so it is hidden and ours
// takes its place. Decisions live in video-mode.logic.ts.

const SETTING = "player.videoMode";
const STYLE_ID = "ytmd-video-mode-style";
const SWITCH_ID = "ytmd-av-switch";
const BAR_BUTTON_ID = "ytmd-av-bar-button";
const AUDIO_VIEW = "ytmd-audio-view";
const SEEK_WINDOW_MS = 15_000;

const CSS = `
ytmusic-av-toggle { display: none !important; }
/* YTM's own slot for its switch, hidden when the switch is unavailable; ours lives there. */
ytmusic-player-page #main-panel { position: relative; }
ytmusic-player-page #av-id { display: flex !important; justify-content: center; position: absolute; top: 12px; left: 0; right: 0; z-index: 2; pointer-events: none; }
html.${AUDIO_VIEW} ytmusic-player #song-video { display: none !important; }
html.${AUDIO_VIEW} ytmusic-player #song-image { display: block !important; }
#${SWITCH_ID} { display: flex; justify-content: center; margin: 0 auto; width: max-content; pointer-events: auto; padding: 3px; gap: 2px;
	border-radius: 999px; background: rgba(255, 255, 255, 0.08); position: relative; z-index: 2; }
#${SWITCH_ID} button { all: unset; cursor: pointer; padding: 6px 18px; border-radius: 999px; font: 500 13px/1 "YouTube Sans", Roboto, sans-serif;
	color: rgba(255, 255, 255, 0.7); transition: background-color 160ms ease, color 160ms ease; }
#${SWITCH_ID} button:hover { color: #fff; }
#${SWITCH_ID} button[aria-pressed="true"] { background: rgba(255, 255, 255, 0.92); color: #0a0a0a; }
#${SWITCH_ID} button[disabled] { opacity: 0.35; cursor: default; }
#${SWITCH_ID} button:focus-visible, #${BAR_BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BAR_BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
	width: 40px; height: 40px; border-radius: 50%; color: rgba(255, 255, 255, 0.7); }
#${BAR_BUTTON_ID}:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BAR_BUTTON_ID} svg { width: 22px; height: 22px; fill: currentColor; }
`;

// Material icons: music note (song) / videocam (video). Built with DOM calls: YouTube enforces Trusted Types,
// which blocks innerHTML strings.
const ICON_SONG = "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z";
const ICON_VIDEO = "M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z";
const SVG_NS = "http://www.w3.org/2000/svg";

function setIcon(button: HTMLElement, d: string): void {
	let path = button.querySelector("path");
	if (!path) {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		path = document.createElementNS(SVG_NS, "path");
		svg.appendChild(path);
		button.appendChild(svg);
	}
	path.setAttribute("d", d);
}

type Player = PlayerApi & {
	addEventListener?: (event: string, handler: () => void) => void;
	removeEventListener?: (event: string, handler: () => void) => void;
	getPlayerResponse?: () => { videoDetails?: { videoId?: string; musicVideoType?: string; thumbnail?: { thumbnails?: { url: string }[] } } };
};

function ensureStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = CSS;
	(document.head ?? document.documentElement).appendChild(el);
}

function currentTrack(api: Player): { id: string; type: string | undefined; thumb: string | undefined } | null {
	const details = api.getPlayerResponse?.()?.videoDetails;
	const id = details?.videoId;
	if (!id) return null;
	const thumbs = details.thumbnail?.thumbnails ?? [];
	return { id, type: details.musicVideoType, thumb: thumbs.at(-1)?.url?.split("?")[0] };
}

/** Set by `start`; `onPlayerApiReady` hands the player over through it. */
let attachPlayer: ((p: Player) => void) | null = null;

const videoModeRenderer: RendererPluginRegistration = {
	id: "video-mode",
	enabled: true,
	start(ctx) {
		let mode: VideoMode = "video";
		let api: Player | null = null;
		let pendingSeek: { id: string; time: number; until: number } | null = null;
		let videoAvailable = true;

		ensureStyle();

		const setAudioView = (on: boolean, track: ReturnType<typeof currentTrack>) => {
			document.documentElement.classList.toggle(AUDIO_VIEW, on);
			if (on) {
				// The cover YTM shows for songs is a placeholder on music videos.
				const img = document.querySelector<HTMLImageElement>("ytmusic-player #song-image img");
				if (img && track?.thumb && (!img.src || img.src.startsWith("data:"))) img.src = track.thumb;
			}
			// No quality change here: setPlaybackQualityRange can reload the stream from near 0 (measured), and a jump
			// back in the song is worse than decoding a hidden video. Audio-only streams are Premium-only on YouTube's side.
		};

		const render = () => {
			const label = mode === "audio" ? "Song" : "Video";
			const sw = document.getElementById(SWITCH_ID);
			if (sw) {
				for (const btn of sw.querySelectorAll<HTMLButtonElement>("button")) {
					const isVideo = btn.dataset.mode === "video";
					btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
					btn.disabled = isVideo && !videoAvailable;
					btn.title = isVideo && !videoAvailable ? "This song has no video" : `Switch to ${btn.dataset.mode === "audio" ? "song" : "video"} (V)`;
				}
			}
			const bar = document.getElementById(BAR_BUTTON_ID);
			if (bar) {
				setIcon(bar, mode === "audio" ? ICON_SONG : ICON_VIDEO);
				bar.title = `${label} mode: switch to ${mode === "audio" ? "video" : "song"} (V)`;
				bar.setAttribute("aria-label", bar.title);
			}
		};

		/** Brings the page in line with `mode`. `toggled`: the user just switched, so a twin may be played. */
		const apply = (toggled: boolean) => {
			const store = resolveYtmStore();
			const wanted = playbackContentMode(mode);
			if (store && store.getState()?.queue?.playbackContentMode !== wanted) {
				store.dispatch({ type: "SET_PLAYBACK_CONTENT_MODE", payload: wanted });
			}
			if (!api) {
				// The hand-off can come late (or not at all after a page reload); the page exposes the player too.
				const page = getPagePlayerApi() as Player | null;
				if (page) attachPlayer?.(page);
			}
			const track = api ? currentTrack(api) : null;
			if (!track) return render();

			if (pendingSeek?.id === track.id && Date.now() < pendingSeek.until) {
				api?.seekTo(pendingSeek.time);
				pendingSeek = null;
			}

			// The playing item and "Up next" (autoplay) live in two lists.
			const queue = store?.getState()?.queue;
			const items = [...(queue?.items ?? []), ...(queue?.automixItems ?? [])];
			const twin = findTwin(items, track.id, mode);
			videoAvailable = track.type !== "MUSIC_VIDEO_TYPE_ATV" || !!findTwin(items, track.id, "video");
			const action = decideVideoMode(mode, { type: track.type, twin });
			switch (action.kind) {
				case "swap":
					if (toggled) {
						pendingSeek = { id: action.twin.videoId, time: api?.getCurrentTime() ?? 0, until: Date.now() + SEEK_WINDOW_MS };
						setAudioView(false, track);
						dispatchYtNavigate(action.twin.endpoint);
					} else {
						setAudioView(mode === "audio" && track.type !== "MUSIC_VIDEO_TYPE_ATV", track);
					}
					break;
				case "hide-video":
					setAudioView(true, track);
					break;
				default:
					setAudioView(false, track);
			}
			render();
		};

		const setMode = (next: VideoMode, persist: boolean) => {
			if (next === mode) return;
			mode = next;
			if (persist) ctx.ytmd?.settings.set(SETTING, next);
			apply(true);
		};
		const toggle = () => setMode(mode === "audio" ? "video" : "audio", true);

		const mount = () => {
			if (!document.getElementById(SWITCH_ID)) {
				const anchor = document.querySelector("ytmusic-player-page ytmusic-av-toggle") ?? null;
				const host = anchor?.parentElement ?? document.querySelector("ytmusic-player-page #main-panel");
				if (host) {
					const sw = document.createElement("div");
					sw.id = SWITCH_ID;
					sw.setAttribute("role", "group");
					sw.setAttribute("aria-label", "Song or video");
					for (const m of ["audio", "video"] as const) {
						const btn = document.createElement("button");
						btn.type = "button";
						btn.dataset.mode = m;
						btn.textContent = m === "audio" ? "Song" : "Video";
						btn.addEventListener("click", (e) => {
							e.stopPropagation();
							setMode(m, true);
						});
						sw.appendChild(btn);
					}
					if (anchor) anchor.insertAdjacentElement("afterend", sw);
					else host.prepend(sw);
				}
			}
			if (!document.getElementById(BAR_BUTTON_ID)) {
				// YTM serves more than one player-bar layout (an A/B test): the classic one has .right-controls-buttons; the
				// redesigned one groups likes, captions and volume on the right, so go next to the like button there.
				const likes = document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer");
				const controls =
					document.querySelector("ytmusic-player-bar .right-controls-buttons") ??
					(likes?.closest("ytmusic-player-bar .middle-controls") ? null : likes?.parentElement) ??
					document.querySelector("ytmusic-player-bar #right-controls");
				if (controls) {
					const btn = document.createElement("button");
					btn.id = BAR_BUTTON_ID;
					btn.type = "button";
					btn.addEventListener("click", (e) => {
						e.stopPropagation();
						toggle();
					});
					controls.prepend(btn);
				}
			}
			render();
		};

		const onKey = (e: KeyboardEvent) => {
			if (!isToggleKey(e, e.target)) return;
			e.preventDefault();
			e.stopPropagation();
			toggle();
		};
		document.addEventListener("keydown", onKey, true);

		const onTrack = () => {
			mount();
			apply(false);
		};

		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === SETTING) setMode(normalizeVideoMode(value), false);
				else if (key === "player") setMode(normalizeVideoMode((value as { videoMode?: unknown } | null)?.videoMode), false);
			}) ?? (() => undefined);

		attachPlayer = (p: Player) => {
			if (p === api) return;
			api?.removeEventListener?.("onVideoDataChange", onTrack);
			api = p;
			api.addEventListener?.("onVideoDataChange", onTrack);
			onTrack();
		};

		// YTM re-stamps the player bar and player page now and then, dropping our nodes; put them back (two id
		// lookups, skipped while the window is hidden).
		// It also picks up the player when the hand-off never came (YTM creates the player only once something plays).
		const remount = window.setInterval(() => {
			if (document.hidden) return;
			if (!api) {
				const page = getPagePlayerApi() as Player | null;
				if (page?.getPlayerResponse?.()?.videoDetails?.videoId) attachPlayer?.(page);
			}
			mount();
		}, 2000);
		const onVisible = () => {
			if (!document.hidden) mount();
		};
		document.addEventListener("visibilitychange", onVisible);

		// Nothing above waits: settings reads over the bridge can be slow, and the player hand-off must not depend on them.
		mount();
		void Promise.resolve(ctx.ytmd?.settings.get(SETTING))
			.then((stored) => setMode(normalizeVideoMode(stored), false))
			.catch(() => undefined);

		return () => {
			attachPlayer = null;
			window.clearInterval(remount);
			document.removeEventListener("visibilitychange", onVisible);
			offSettings();
			document.removeEventListener("keydown", onKey, true);
			api?.removeEventListener?.("onVideoDataChange", onTrack);
			setAudioView(false, null);
			document.getElementById(SWITCH_ID)?.remove();
			document.getElementById(BAR_BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
	onPlayerApiReady(playerApi) {
		attachPlayer?.(playerApi as Player);
	},
};

export default videoModeRenderer;
