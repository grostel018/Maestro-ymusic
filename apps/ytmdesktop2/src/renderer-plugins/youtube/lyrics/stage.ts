// Full-screen karaoke (roadmap F6, after Apple Music "Sing"): the lyrics alone, huge, over the blurred artwork, with a
// small vocal-reduction control (the audio engine's karaoke stage, D6) that hides after 3 s without the mouse. Opened
// from the player bar's microphone button or Shift+K; Esc or the button leaves. Playback never pauses.
import { normalizeAudio } from "@shared/audio/settings";
import { setIcon } from "../video-controls.menu";
import type { LyricsLineStyle } from "./line-style";
import type { LyricsStoreSnapshot } from "./store";
import { createLyricsRenderer, type LyricsGlow, type LyricsRenderApi } from "./ui/apple";

const ROOT_ID = "ytmd-karaoke";
const BUTTON_ID = "ytmd-sing-button";
const STYLE_ID = "ytmd-karaoke-style";
const HIDE_MS = 3000;
// Material "skip_previous", "play_arrow", "pause", "skip_next".
const PREV = "M6 6h2v12H6zm3.5 6 8.5 6V6z";
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
const NEXT = "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z";
const PLAYER_BAR = "ytmusic-player-bar";
const MAIN_VIDEO = "video.html5-main-video, #movie_player video";
// Material "mic".
const MIC = "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 2147482500; display: flex; flex-direction: column; color: #fff; overflow: hidden;
	background-color: var(--ytmd-base, #030303); --beat: var(--ytmd-al-beat, .3); }
/* Backdrop: the blurred artwork drifting slowly, with two pools of the song's color that swell on the beat. */
#${ROOT_ID} .ytmd-k-bg { position: absolute; inset: -20%; z-index: 0; pointer-events: none; }
#${ROOT_ID} .ytmd-k-bg::before { content: ""; position: absolute; inset: 0; background: var(--ytmd-thumbnail-blur-url, none) center / cover;
	filter: blur(40px) saturate(1.4) brightness(.55); animation: ytmd-k-drift 40s ease-in-out infinite alternate; will-change: transform; }
#${ROOT_ID} .ytmd-k-bg::after { content: ""; position: absolute; inset: 0;
	background: radial-gradient(40% 40% at 25% 35%, color-mix(in srgb, var(--ytmd-thumbnail-accent, #444) 55%, transparent), transparent 70%),
		radial-gradient(35% 35% at 75% 70%, color-mix(in srgb, var(--ytmd-thumbnail-accent, #444) 40%, transparent), transparent 70%);
	opacity: calc(.35 + .5 * var(--beat)); transform: scale(calc(1 + .06 * var(--beat))); transition: opacity 120ms linear, transform 120ms linear;
	animation: ytmd-k-swirl 28s linear infinite; }
@keyframes ytmd-k-drift { from { transform: scale(1.1) rotate(0deg) translate(0, 0); } to { transform: scale(1.25) rotate(8deg) translate(3%, -2%); } }
@keyframes ytmd-k-swirl { to { rotate: 360deg; } }
#${ROOT_ID} > :not(.ytmd-k-bg) { position: relative; z-index: 1; }
#${ROOT_ID} .ytmd-k-host { flex: 1 1 auto; min-height: 0; padding: 4vh 6vw 0; }
#${ROOT_ID} .ytmd-k-info { position: absolute; top: 24px; left: 28px; display: flex; align-items: center; gap: 14px; max-width: 40vw;
	font: 500 14px "YouTube Sans", Roboto, sans-serif; transition: opacity 300ms ease; }
#${ROOT_ID} .ytmd-k-info img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; box-shadow: 0 6px 18px rgba(0,0,0,.45); }
#${ROOT_ID} .ytmd-k-info b { display: block; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${ROOT_ID} .ytmd-k-info span { display: block; color: rgba(255,255,255,.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${ROOT_ID} .ytmd-k-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.12); }
#${ROOT_ID} .ytmd-k-progress i { display: block; height: 100%; width: 100%; transform-origin: left; transform: scaleX(0);
	background: var(--ytmd-thumbnail-accent, #fff); }
#${ROOT_ID}.idle .ytmd-k-info { opacity: .35; }
#${ROOT_ID} .ytmd-k-bar { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
	padding: 10px 18px; border-radius: 999px; background: rgba(0,0,0,.55); font: 500 14px "YouTube Sans", Roboto, sans-serif; transition: opacity 300ms ease; }
#${ROOT_ID}.idle .ytmd-k-bar { opacity: 0; pointer-events: none; }
#${ROOT_ID}.idle { cursor: none; }
#${ROOT_ID} .ytmd-k-bar button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.12); }
#${ROOT_ID} .ytmd-k-bar button[aria-pressed="true"] { background: #fff; color: #000; }
#${ROOT_ID} .ytmd-k-bar .ytmd-k-icon { display: inline-flex; padding: 6px; border-radius: 50%; }
#${ROOT_ID} .ytmd-k-bar .ytmd-k-icon svg { width: 22px; height: 22px; fill: currentColor; }
@media (prefers-reduced-motion: reduce) { #${ROOT_ID} .ytmd-k-bg::before, #${ROOT_ID} .ytmd-k-bg::after { animation: none; } }
#${ROOT_ID} .ytmd-k-bar input { width: 140px; }
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
	border-radius: 50%; color: rgba(255, 255, 255, 0.7); }
#${BUTTON_ID}:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BUTTON_ID} svg { width: 20px; height: 20px; fill: currentColor; }
`;

type Settings = { get(key: string): Promise<unknown> | unknown; set(key: string, value: unknown): void };

export interface KaraokeStage {
	setSnapshot(snap: LyricsStoreSnapshot): void;
	repaint(): void;
	destroy(): void;
}

export function createKaraokeStage(opts: {
	settings: Settings | null;
	lineStyle: () => LyricsLineStyle;
	onSeek: (ms: number) => void;
	fontScale?: () => number;
	glow?: () => { mode: LyricsGlow; color: string };
}): KaraokeStage {
	let snap: LyricsStoreSnapshot = { status: "idle", result: null, videoId: null };
	let renderer: LyricsRenderApi | null = null;
	let idleTimer = 0;
	let infoTimer = 0;
	let progressRaf = 0;
	let enteredFullscreen = false;

	if (!document.getElementById(STYLE_ID)) {
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = CSS;
		(document.head ?? document.documentElement).appendChild(style);
	}

	const root = () => document.getElementById(ROOT_ID);

	const readAudio = async () => normalizeAudio(await opts.settings?.get("audio"));
	const renderVocals = async () => {
		const a = await readAudio();
		const btn = root()?.querySelector<HTMLButtonElement>(".ytmd-k-vocals");
		const slider = root()?.querySelector<HTMLInputElement>(".ytmd-k-amount");
		if (btn) {
			btn.setAttribute("aria-pressed", String(a.karaoke.enabled));
			btn.textContent = a.karaoke.enabled ? "Vocals reduced" : "Reduce vocals";
		}
		if (slider) {
			slider.value = String(Math.round(a.karaoke.amount * 100));
			slider.disabled = !a.karaoke.enabled;
		}
	};
	const writeKaraoke = async (patch: Partial<{ enabled: boolean; amount: number }>) => {
		const a = await readAudio();
		a.karaoke = { ...a.karaoke, ...patch };
		opts.settings?.set("audio", a);
		void renderVocals();
	};

	const wake = () => {
		const r = root();
		if (!r) return;
		r.classList.remove("idle");
		window.clearTimeout(idleTimer);
		idleTimer = window.setTimeout(() => r.classList.add("idle"), HIDE_MS);
	};

	/** Title, artist and cover from the page's media session (shared with this world), the play state from the video. */
	const renderInfo = () => {
		const r = root();
		if (!r) return;
		const meta = navigator.mediaSession?.metadata;
		const info = r.querySelector<HTMLElement>(".ytmd-k-info");
		if (info && meta) {
			const art = [...(meta.artwork ?? [])].sort((a, b) => Number.parseInt(b.sizes ?? "0", 10) - Number.parseInt(a.sizes ?? "0", 10))[0]?.src ?? "";
			const img = info.querySelector("img");
			if (img && art && img.src !== art) img.src = art;
			const title = info.querySelector("b");
			const artist = info.querySelector("span");
			if (title && title.textContent !== meta.title) title.textContent = meta.title;
			if (artist && artist.textContent !== meta.artist) artist.textContent = meta.artist;
		}
		const play = r.querySelector<HTMLButtonElement>(".ytmd-k-play");
		const paused = document.querySelector<HTMLVideoElement>(MAIN_VIDEO)?.paused ?? true;
		if (play && play.dataset.paused !== String(paused)) {
			play.dataset.paused = String(paused);
			setIcon(play, paused ? PLAY : PAUSE);
			play.setAttribute("aria-label", paused ? "Play" : "Pause");
		}
	};
	const tickProgress = () => {
		progressRaf = requestAnimationFrame(tickProgress);
		const v = document.querySelector<HTMLVideoElement>(MAIN_VIDEO);
		const bar = root()?.querySelector<HTMLElement>(".ytmd-k-progress i");
		if (v && bar && v.duration > 0) bar.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
	};
	/** Uses YouTube Music's own player-bar buttons, so queue rules (shuffle, repeat) stay the same. */
	const press = (selector: string) => document.querySelector<HTMLElement>(`${PLAYER_BAR} ${selector}`)?.click();
	const iconButton = (cls: string, label: string, path: string, onClick: () => void) => {
		const b = document.createElement("button");
		b.type = "button";
		b.className = `ytmd-k-icon ${cls}`;
		b.setAttribute("aria-label", label);
		b.title = label;
		setIcon(b, path);
		b.addEventListener("click", () => {
			onClick();
			window.setTimeout(renderInfo, 150);
		});
		return b;
	};

	const close = () => {
		const r = root();
		if (!r) return;
		window.clearInterval(infoTimer);
		cancelAnimationFrame(progressRaf);
		progressRaf = 0;
		renderer?.destroy();
		renderer = null;
		r.remove();
		window.clearTimeout(idleTimer);
		if (enteredFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
		enteredFullscreen = false;
	};

	const open = () => {
		if (root()) return;
		const r = document.createElement("div");
		r.id = ROOT_ID;
		r.setAttribute("role", "dialog");
		r.setAttribute("aria-label", "Karaoke");
		const host = document.createElement("div");
		host.className = "ytmd-k-host";
		const bg = document.createElement("div");
		bg.className = "ytmd-k-bg";
		bg.setAttribute("aria-hidden", "true");
		const info = document.createElement("div");
		info.className = "ytmd-k-info";
		const cover = document.createElement("img");
		cover.alt = "";
		const text = document.createElement("div");
		text.append(document.createElement("b"), document.createElement("span"));
		info.append(cover, text);
		const progress = document.createElement("div");
		progress.className = "ytmd-k-progress";
		progress.appendChild(document.createElement("i"));
		const bar = document.createElement("div");
		bar.className = "ytmd-k-bar";
		const vocals = document.createElement("button");
		vocals.type = "button";
		vocals.className = "ytmd-k-vocals";
		vocals.addEventListener("click", async () => writeKaraoke({ enabled: !(await readAudio()).karaoke.enabled }));
		const amount = document.createElement("input");
		amount.type = "range";
		amount.min = "0";
		amount.max = "100";
		amount.className = "ytmd-k-amount";
		amount.setAttribute("aria-label", "How much to reduce the vocals");
		amount.addEventListener("change", () => void writeKaraoke({ amount: Number(amount.value) / 100 }));
		const exit = document.createElement("button");
		exit.type = "button";
		exit.textContent = "Exit (Esc)";
		exit.addEventListener("click", close);
		const prev = iconButton("ytmd-k-prev", "Previous", PREV, () => press(".previous-button"));
		const play = iconButton("ytmd-k-play", "Play", PLAY, () => press(".play-pause-button"));
		const next = iconButton("ytmd-k-next", "Next", NEXT, () => press(".next-button"));
		bar.append(prev, play, next, vocals, amount, exit);
		r.append(bg, info, host, progress, bar);
		document.body.appendChild(r);
		r.addEventListener("mousemove", wake);
		renderer = createLyricsRenderer(() => host, {
			showTimeCodes: () => false,
			lineStyle: opts.lineStyle,
			onSeek: opts.onSeek,
			variant: "stage",
			fontScale: opts.fontScale,
			glow: opts.glow,
		});
		renderer.setSnapshot(snap);
		renderer.setRunning(true);
		renderInfo();
		infoTimer = window.setInterval(renderInfo, 1000);
		progressRaf = requestAnimationFrame(tickProgress);
		void renderVocals();
		wake();
		if (!document.fullscreenElement) {
			void document.documentElement
				.requestFullscreen()
				.then(() => {
					enteredFullscreen = true;
				})
				.catch(() => undefined);
		}
	};

	const toggle = () => (root() ? close() : open());

	const onKey = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null;
		if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
		if (e.key === "Escape" && root()) {
			e.preventDefault();
			e.stopImmediatePropagation();
			close();
			return;
		}
		if (e.key === "K" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			e.stopImmediatePropagation();
			toggle();
		}
	};
	const onFullscreen = () => {
		// Leaving full screen (Esc handled by the browser) also leaves karaoke.
		if (enteredFullscreen && !document.fullscreenElement) {
			enteredFullscreen = false;
			close();
		}
	};
	window.addEventListener("keydown", onKey, true);
	document.addEventListener("fullscreenchange", onFullscreen);

	// The player-bar button, next to the sleep timer (or the other buttons we add).
	const mount = () => {
		if (document.getElementById(BUTTON_ID)) return;
		const anchor =
			document.getElementById("ytmd-sleep-button") ?? document.getElementById("ytmd-output-button") ?? document.getElementById("ytmd-av-bar-button");
		if (!anchor?.parentElement) return;
		const btn = document.createElement("button");
		btn.id = BUTTON_ID;
		btn.type = "button";
		btn.title = "Sing: full-screen lyrics (Shift+K)";
		btn.setAttribute("aria-label", btn.title);
		setIcon(btn, MIC);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggle();
		});
		anchor.insertAdjacentElement("afterend", btn);
	};
	const remount = window.setInterval(() => {
		if (!document.hidden) mount();
	}, 2000);
	mount();

	return {
		setSnapshot(next) {
			snap = next;
			renderer?.setSnapshot(next);
		},
		repaint() {
			renderer?.repaint();
		},
		destroy() {
			close();
			window.clearInterval(remount);
			window.removeEventListener("keydown", onKey, true);
			document.removeEventListener("fullscreenchange", onFullscreen);
			document.getElementById(BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		},
	};
}
