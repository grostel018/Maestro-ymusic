import type { PlayerApi } from "ytm-client-api";
import {
	ATV,
	decideVideoMode,
	findTwin,
	isToggleKey,
	normalizeVideoMode,
	playbackContentMode,
	playingIndex,
	rowTrack,
	type VideoMode,
	wrapWithCounterpart,
} from "./video-mode.logic";
import type { MatchKind, VersionMatch } from "./video-mode.match";
import { createMatchCache, createVersionFinder } from "./video-mode.search";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";
import { resolveYtmApp, resolveYtmStore } from "./ytm-store";

// Audio ⇄ video (roadmap C1). One setting, `player.videoMode`, flipped by our Song/Video switch on the player page,
// a player-bar button, or `V`. YTM's own switch is Premium-only (disabled otherwise), so it is hidden and ours
// takes its place. Decisions live in video-mode.logic.ts.
// C1b: without Premium YouTube sends no song/video pairs, so the other version is found by search
// (video-mode.search.ts) and paired with the playing queue row; YTM then switches between them itself.

const SETTING = "player.videoMode";
const STYLE_ID = "ytmd-video-mode-style";
const SWITCH_ID = "ytmd-av-switch";
const HINT_ID = "ytmd-av-hint";
const BAR_BUTTON_ID = "ytmd-av-bar-button";
const AUDIO_VIEW = "ytmd-audio-view";
const NO_MATCH = "ytmd-av-nomatch";
const SEEK_WINDOW_MS = 15_000;

const CSS = `
ytmusic-av-toggle { display: none !important; }
/* YTM's own slot for its switch, hidden when the switch is unavailable; ours lives there. */
ytmusic-player-page #main-panel { position: relative; }
ytmusic-player-page #av-id { display: flex !important; flex-direction: column; align-items: center; gap: 6px; position: absolute; top: 12px; left: 0; right: 0; z-index: 2; pointer-events: none; }
/* Beside Up next: the switch sits just above the picture, however much room the panel has around it. The picture is
   16:9 of the panel's width, or a square in Song mode; a picture as tall as the panel keeps the switch on top of it.
   Only with the player page open: containment would trap the full-screen and mini players' position: fixed. */
@media (min-width: 936px) {
	ytmusic-player-page[player-page-open]:not([player-fullscreened]) #main-panel { container-type: size; }
	ytmusic-player-page[player-page-open]:not([player-fullscreened]) #av-id { top: max(12px, calc(50cqh - 28.125cqw - 44px)); }
	ytmusic-player-page[player-page-open]:not([player-fullscreened]):not([video-mode]) #av-id, html.${AUDIO_VIEW} ytmusic-player-page[player-page-open]:not([player-fullscreened]) #av-id { top: max(12px, calc(50cqh - 50cqw - 44px)); }
}
/* Up next below the player (YTM's narrow layout, panel height 56.25vw): the switch keeps its own row above the picture,
   and a square cover fits under it instead of running into the tabs. */
@media (max-width: 935px) {
	ytmusic-player-page:not([player-fullscreened]) #player { margin-top: 44px !important; }
	/* :not([video-mode]) is a real song; the class is a music video showing only its cover. */
	ytmusic-player-page:not([player-fullscreened]):not([video-mode]) #player, html.${AUDIO_VIEW} ytmusic-player-page:not([player-fullscreened]) #player { width: calc(56.25vw - 52px) !important; height: calc(56.25vw - 52px) !important; flex: 0 0 auto !important; margin: 48px auto 0 !important; }
}
html.${AUDIO_VIEW} ytmusic-player #song-video { display: none !important; }
html.${AUDIO_VIEW} ytmusic-player #song-image { display: block !important; }
/* No song version: the video's thumbnail as a square, centre-cropped (no 16:9 frame with bands). */
html.${AUDIO_VIEW}.${NO_MATCH} ytmusic-player #song-image img { object-fit: cover !important; aspect-ratio: 1 / 1; height: auto !important; }
#${HINT_ID} { font: 400 12px/1.2 "YouTube Sans", Roboto, sans-serif; color: color-mix(in srgb, var(--ytmd-text, #fff) 60%, transparent); pointer-events: none; }
#${HINT_ID}[hidden] { display: none; }
#${SWITCH_ID} { display: flex; justify-content: center; margin: 0 auto; width: max-content; pointer-events: auto; padding: 3px; gap: 2px;
	border-radius: 999px; background: rgba(0, 0, 0, 0.55); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); position: relative; z-index: 2; }
#${SWITCH_ID} button { all: unset; cursor: pointer; padding: 6px 18px; border-radius: 999px; font: 500 13px/1 "YouTube Sans", Roboto, sans-serif;
	color: rgba(255, 255, 255, 0.7); transition: background-color 160ms ease, color 160ms ease; }
#${SWITCH_ID} button:hover { color: #fff; }
#${SWITCH_ID} button[aria-pressed="true"] { background: rgba(255, 255, 255, 0.92); color: #0a0a0a; }
#${SWITCH_ID} button[disabled] { opacity: 0.35; cursor: default; }
#${SWITCH_ID} button:focus-visible, #${BAR_BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BAR_BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
	width: 40px; height: 40px; border-radius: 50%; color: color-mix(in srgb, var(--ytmd-text, #fff) 70%, transparent); }
#${BAR_BUTTON_ID}:hover { color: var(--ytmd-text, #fff); background: color-mix(in srgb, var(--ytmd-text, #fff) 8%, transparent); }
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
	getPlayerResponse?: () => {
		videoDetails?: {
			videoId?: string;
			title?: string;
			author?: string;
			lengthSeconds?: string;
			musicVideoType?: string;
			thumbnail?: { thumbnails?: { url: string }[] };
		};
	};
};

type Track = { id: string; type: string | undefined; thumb: string | undefined; title: string; artist: string; durationSec: number };

function pageStorage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function ensureStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = CSS;
	(document.head ?? document.documentElement).appendChild(el);
}

function currentTrack(api: Player): Track | null {
	const details = api.getPlayerResponse?.()?.videoDetails;
	const id = details?.videoId;
	if (!id) return null;
	const thumbs = details.thumbnail?.thumbnails ?? [];
	return {
		id,
		type: details.musicVideoType,
		thumb: thumbs.at(-1)?.url?.split("?")[0],
		title: details.title ?? "",
		artist: details.author ?? "",
		durationSec: Number(details.lengthSeconds) || 0,
	};
}

function describeMatch(m: VersionMatch): string {
	return `${m.title} · ${m.artist}${m.album ? ` (${m.album})` : ""}`;
}

/** Set by `start`; `onPlayerApiReady` hands the player over through it. */
let attachPlayer: ((p: Player) => void) | null = null;

const videoModeRenderer: RendererPluginRegistration = {
	id: "video-mode",
	enabled: true,
	start(ctx) {
		let mode: VideoMode = "video";
		let api: Player | null = null;
		let videoAvailable = true;
		/** The pair we made for the playing row, for the switch's tooltip. */
		let paired: { ids: string[]; match: VersionMatch } | null = null;
		/** Song mode found no song version for the playing track. */
		let noSong = false;
		/** The first switch to a found version starts where the row was; later switches use YTM's own mapping. */
		let oneShot: { fromId: string; toId: string; endpoint: Record<string, unknown> } | null = null;
		/** Where a switch started, until the other version plays (see setMode). */
		let pendingSeek: { ids: string[]; time: number; until: number } | null = null;

		ensureStyle();

		const finder = createVersionFinder(() => {
			const network = resolveYtmApp()?.networkManager;
			return network?.fetch ? (path, body) => network.fetch(path, body) : null;
		}, createMatchCache(pageStorage()));

		const setAudioView = (on: boolean, track: Track | null, cover: { art?: string; square?: boolean } = {}) => {
			const root = document.documentElement.classList;
			root.toggle(AUDIO_VIEW, on);
			root.toggle(NO_MATCH, on && !!cover.square);
			if (on) {
				// The cover YTM shows for songs is a placeholder on music videos.
				const img = document.querySelector<HTMLImageElement>("ytmusic-player #song-image img");
				if (img && cover.art && img.src !== cover.art) img.src = cover.art;
				else if (img && track?.thumb && (!img.src || img.src.startsWith("data:"))) img.src = track.thumb;
			}
			// No quality change here: setPlaybackQualityRange can reload the stream from near 0 (measured), and a jump
			// back in the song is worse than decoding a hidden video. Audio-only streams are Premium-only on YouTube's side.
		};

		const render = () => {
			const label = mode === "audio" ? "Song" : "Video";
			const playingId = api ? currentTrack(api)?.id : undefined;
			const pairInfo = paired && playingId && paired.ids.includes(playingId) ? describeMatch(paired.match) : "";
			const sw = document.getElementById(SWITCH_ID);
			if (sw) {
				for (const btn of sw.querySelectorAll<HTMLButtonElement>("button")) {
					const isVideo = btn.dataset.mode === "video";
					btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
					btn.disabled = isVideo && !videoAvailable;
					btn.title = isVideo && !videoAvailable ? "This song has no video" : `Switch to ${btn.dataset.mode === "audio" ? "song" : "video"} (V)`;
					if (pairInfo) btn.title += `\nFound version: ${pairInfo}`;
				}
			}
			const hint = document.getElementById(HINT_ID);
			if (hint) hint.hidden = !(mode === "audio" && noSong);
			const bar = document.getElementById(BAR_BUTTON_ID);
			if (bar) {
				setIcon(bar, mode === "audio" ? ICON_SONG : ICON_VIDEO);
				bar.title = `${label} mode: switch to ${mode === "audio" ? "video" : "song"} (V)`;
				bar.setAttribute("aria-label", bar.title);
			}
		};

		/** Which other version the playing track needs: its song in Song mode, its video in Video mode. */
		const otherVersion = (track: Track): MatchKind | null => {
			if (mode === "audio" && track.type !== ATV) return "song";
			if (mode === "video" && track.type === ATV) return "video";
			return null;
		};

		const lookup = (track: Track, want: MatchKind) => {
			const { id: videoId, title, artist, durationSec } = track;
			void finder.find({ videoId, title, artist, durationSec, want }).then(() => {
				// Only a settled answer (cached hit or miss) re-runs apply: a superseded request, a timeout or an error
				// would make apply look the track up again at once, in a loop.
				if (finder.peek(videoId, want) === undefined) return;
				const now = api ? currentTrack(api) : null;
				if (now?.id === videoId && otherVersion(now) === want) apply();
			});
		};

		/** Pairs the playing row with `match`; YTM then plays it, at the same position, and keeps the queue. */
		const pair = (track: Track, match: VersionMatch): boolean => {
			const store = resolveYtmStore();
			const items = store?.getState()?.queue?.items;
			const index = playingIndex(items, track.id);
			if (!store || !items || index < 0) return false;
			const wrapped = wrapWithCounterpart(items[index], match, { primaryDurationSec: track.durationSec, startTimeSeconds: api?.getCurrentTime() });
			if (!wrapped) return false;
			oneShot = { fromId: track.id, toId: match.videoId, endpoint: wrapped.watchEndpoint };
			paired = { ids: [track.id, match.videoId], match };
			const next = items.slice();
			next[index] = wrapped.item;
			// The playback mode already prefers the match, so the new row makes YTM switch to it.
			store.dispatch({ type: "RESET_ITEMS", payload: next });
			return true;
		};

		/** Song mode: look up the next row's song ahead of time, so the switch is instant when it starts. */
		const prefetchNext = (index: number) => {
			const queue = resolveYtmStore()?.getState()?.queue;
			const next = rowTrack(queue?.items?.[index + 1] ?? queue?.automixItems?.[0]);
			if (!next || next.type === ATV || !next.durationSec || finder.peek(next.videoId, "song") !== undefined) return;
			void finder.find({ ...next, want: "song" });
		};

		/** Brings the page in line with `mode`. */
		const apply = () => {
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

			if (pendingSeek && (Date.now() > pendingSeek.until || !pendingSeek.ids.includes(track.id))) pendingSeek = null;
			else if (pendingSeek && pendingSeek.time >= 1 && (api?.getCurrentTime() ?? 0) + 2 < pendingSeek.time && (mode === "audio") === (track.type === ATV)) {
				api?.seekTo(pendingSeek.time);
				pendingSeek = null;
			}

			if (oneShot && track.id !== oneShot.fromId) {
				// The switch happened (or the user moved on): later switches map the position through YTM's segment map.
				delete oneShot.endpoint.startTimeSeconds;
				oneShot = null;
			}

			// The playing item and "Up next" (autoplay) live in two lists.
			const queue = store?.getState()?.queue;
			const items = [...(queue?.items ?? []), ...(queue?.automixItems ?? [])];
			let twin = findTwin(items, track.id, mode);
			const want = twin ? null : otherVersion(track);
			const found = want ? finder.peek(track.id, want) : undefined;
			if (want && found === undefined) lookup(track, want);
			let cover: { art?: string; square?: boolean } = {};
			if (want && found) {
				if (pair(track, found)) twin = { videoId: found.videoId, endpoint: {} };
				// No queue row to pair with: show the found cover at least.
				else cover = { art: found.art };
			}
			noSong = want === "song" && found === null;
			if (noSong) cover = { square: true };
			const index = playingIndex(queue?.items, track.id);
			if (want === "song" && found !== undefined && index >= 0) prefetchNext(index);
			videoAvailable = track.type !== ATV || !!findTwin(items, track.id, "video") || finder.peek(track.id, "video") !== null;

			// A twin is played by YTM itself when its playback mode (set above) prefers it, at the mapped position.
			const action = decideVideoMode(mode, { type: track.type, twin });
			switch (action.kind) {
				case "swap":
					setAudioView(mode === "audio" && track.type !== ATV, track);
					break;
				case "hide-video":
					setAudioView(true, track, cover);
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
			// YTM maps the position from the player's current time, which reads 0 while the other version is still
			// loading (a quick switch back); remember where the track was and correct a start near 0.
			const track = api ? currentTrack(api) : null;
			const pending = typeof oneShot?.endpoint.startTimeSeconds === "number" ? oneShot.endpoint.startTimeSeconds : 0;
			const now = api?.getCurrentTime() ?? 0;
			const ids = paired?.ids ?? (track ? [track.id] : []);
			pendingSeek = ids.length ? { ids, time: now >= 1 ? now : pending, until: Date.now() + SEEK_WINDOW_MS } : null;
			apply();
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
			const sw = document.getElementById(SWITCH_ID);
			if (sw && !document.getElementById(HINT_ID)) {
				const hint = document.createElement("div");
				hint.id = HINT_ID;
				hint.hidden = true;
				hint.textContent = "No song version found";
				sw.insertAdjacentElement("afterend", hint);
			}
			if (!document.getElementById(BAR_BUTTON_ID)) {
				// YTM serves more than one player-bar layout (an A/B test): the classic one has .right-controls-buttons; the
				// redesigned one groups likes, captions and volume on the right, so go next to the like button there. A third
				// one replaces the bar with ytmusic-miniplayer; its right section takes the button.
				const likes = document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer");
				const controls =
					document.querySelector("ytmusic-player-bar .right-controls-buttons") ??
					(likes?.closest("ytmusic-player-bar .middle-controls") ? null : likes?.parentElement) ??
					document.querySelector("ytmusic-player-bar #right-controls") ??
					document.querySelector("ytmusic-miniplayer .ytMusicMiniPlayerRightSection");
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
			apply();
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
			document.getElementById(HINT_ID)?.remove();
			document.getElementById(BAR_BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
	onPlayerApiReady(playerApi) {
		attachPlayer?.(playerApi as Player);
	},
};

export default videoModeRenderer;
