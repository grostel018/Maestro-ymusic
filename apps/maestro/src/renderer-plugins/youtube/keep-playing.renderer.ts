// Keep playing (spec 2026-11-17 §2). After long idle YouTube shows "Video paused. Continue watching?" and pauses;
// we confirm it and resume. A stream that errors mid-song is retried once at the same position.
import type { PlayerApi } from "ytm-client-api";
import { KEEP_PLAYING_SELECTORS, shouldRetry } from "./keep-playing.logic";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

type Player = PlayerApi & {
	playVideo?: () => void;
	getPlayerState?: () => number;
	getCurrentTime?: () => number;
	loadVideoById?: (id: string, startSeconds?: number) => void;
	getVideoData?: () => { video_id?: string } | undefined;
};

/** A pause this soon after the prompt was the prompt's doing. */
const PROMPT_PAUSE_MS = 2000;
const PAUSED = 2;
const log = (...args: unknown[]) => console.debug("[keep-playing]", ...args);

let attach: ((p: Player) => void) | null = null;

const keepPlayingRenderer: RendererPluginRegistration = {
	id: "keep-playing",
	enabled: true,
	start() {
		let api: Player | null = null;
		let promptAt = 0;
		const errors = new Map<string, { errors: number; lastErrorAt: number }>();

		const player = () => api ?? (getPagePlayerApi() as Player | null);

		const dismiss = () => {
			const prompt = document.querySelector<HTMLElement>(KEEP_PLAYING_SELECTORS.prompt);
			if (!prompt || prompt.offsetParent === null) return;
			const confirm = document.querySelector<HTMLElement>(KEEP_PLAYING_SELECTORS.confirm);
			if (!confirm) return;
			promptAt = Date.now();
			confirm.click();
			log("dismissed the idle prompt");
			const p = player();
			if (p?.getPlayerState?.() === PAUSED) {
				p.playVideo?.();
				log("resumed after the idle prompt");
			}
		};

		const host = document.querySelector(KEEP_PLAYING_SELECTORS.popup) ?? document.body;
		const observer = new MutationObserver(() => {
			if (document.querySelector(KEEP_PLAYING_SELECTORS.prompt)) dismiss();
		});
		observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden"] });

		// The prompt may pause just after showing; resume a pause that follows it closely.
		const onPause = () => {
			if (!promptAt || Date.now() - promptAt > PROMPT_PAUSE_MS) return;
			player()?.playVideo?.();
			log("resumed a pause caused by the idle prompt");
		};

		const onError = () => {
			const p = player();
			const id = p?.getVideoData?.()?.video_id;
			if (!p || !id) return;
			const state = errors.get(id) ?? { errors: 0, lastErrorAt: 0 };
			const now = Date.now();
			if (!shouldRetry({ ...state, now })) return;
			errors.set(id, { errors: state.errors + 1, lastErrorAt: now });
			const at = p.getCurrentTime?.() ?? 0;
			log("stream error, retrying once at", at);
			p.loadVideoById?.(id, at);
		};

		let video: HTMLVideoElement | null = null;
		const bindVideo = () => {
			const next = document.querySelector<HTMLVideoElement>("ytmusic-player video");
			if (next === video) return;
			video?.removeEventListener("pause", onPause);
			video?.removeEventListener("error", onError);
			video = next;
			video?.addEventListener("pause", onPause);
			video?.addEventListener("error", onError);
		};
		bindVideo();
		const rebind = window.setInterval(() => {
			if (!document.hidden) bindVideo();
		}, 5000);

		// Media keys are activity too: tell YTM's idle timer, so the prompt rarely shows.
		const onKey = (e: KeyboardEvent) => {
			if (e.key.startsWith("Media")) document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		};
		document.addEventListener("keydown", onKey, true);

		attach = (p) => {
			api = p;
		};

		return () => {
			attach = null;
			observer.disconnect();
			window.clearInterval(rebind);
			video?.removeEventListener("pause", onPause);
			video?.removeEventListener("error", onError);
			document.removeEventListener("keydown", onKey, true);
		};
	},
	onPlayerApiReady(playerApi) {
		attach?.(playerApi as Player);
	},
};

export default keepPlayingRenderer;
