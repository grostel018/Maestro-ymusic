// Full-screen karaoke (roadmap F6, after Apple Music "Sing"): the lyrics alone, huge, over the blurred artwork, with a
// small vocal-reduction control (the audio engine's karaoke stage, D6) that hides after 3 s without the mouse. Opened
// from the player bar's microphone button or Shift+K; Esc or the button leaves. Playback never pauses.
import { normalizeAudio } from "@shared/audio/settings";
import { setIcon } from "../video-controls.menu";
import type { LyricsLineStyle } from "./line-style";
import type { LyricsStoreSnapshot } from "./store";
import { createLyricsRenderer, type LyricsRenderApi } from "./ui/apple";

const ROOT_ID = "ytmd-karaoke";
const BUTTON_ID = "ytmd-sing-button";
const STYLE_ID = "ytmd-karaoke-style";
const HIDE_MS = 3000;
// Material "mic".
const MIC = "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 2147482500; display: flex; flex-direction: column; color: #fff;
	background-color: var(--ytmd-base, #030303);
	background-image: linear-gradient(color-mix(in srgb, var(--ytmd-base, #030303) 55%, transparent), color-mix(in srgb, var(--ytmd-base, #030303) 55%, transparent)), var(--ytmd-thumbnail-blur-url, none);
	background-size: 100% 100%, cover; background-position: center; }
#${ROOT_ID} .ytmd-k-host { flex: 1 1 auto; min-height: 0; padding: 4vh 6vw 0; }
#${ROOT_ID} .ytmd-k-bar { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
	padding: 10px 18px; border-radius: 999px; background: rgba(0,0,0,.55); font: 500 14px "YouTube Sans", Roboto, sans-serif; transition: opacity 300ms ease; }
#${ROOT_ID}.idle .ytmd-k-bar { opacity: 0; pointer-events: none; }
#${ROOT_ID}.idle { cursor: none; }
#${ROOT_ID} .ytmd-k-bar button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.12); }
#${ROOT_ID} .ytmd-k-bar button[aria-pressed="true"] { background: #fff; color: #000; }
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
	destroy(): void;
}

export function createKaraokeStage(opts: { settings: Settings | null; lineStyle: () => LyricsLineStyle; onSeek: (ms: number) => void }): KaraokeStage {
	let snap: LyricsStoreSnapshot = { status: "idle", result: null, videoId: null };
	let renderer: LyricsRenderApi | null = null;
	let idleTimer = 0;
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

	const close = () => {
		const r = root();
		if (!r) return;
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
		bar.append(vocals, amount, exit);
		r.append(host, bar);
		document.body.appendChild(r);
		r.addEventListener("mousemove", wake);
		renderer = createLyricsRenderer(() => host, { showTimeCodes: () => false, lineStyle: opts.lineStyle, onSeek: opts.onSeek, variant: "stage" });
		renderer.setSnapshot(snap);
		renderer.setRunning(true);
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
