import { analyserLevel, getAudioEngine, MAIN_VIDEO } from "./audio-engine/instance";
import type { FadeInstance } from "./audio-engine/stages";
import { fadeOutAt, SilenceTracker, SKIP_STEP_S, SLEEP_FADE_S, type SleepTimer, sleepAction, sleepLabel } from "./audio-engine/transitions.logic";
import { openMenu, setIcon } from "./video-controls.menu";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// Transitions (roadmap D5) on the engine's fade stage: fade out before the end and in on the next track, skip
// silence, and a sleep timer (player-bar button) that fades for 10 s and pauses. No true overlap of two tracks:
// see docs/superpowers/plans/2026-10-26-phase-d-audio-lab.md.

declare global {
	interface Window {
		/** Test hook: set the sleep timer (ms from now, "end" or "off") and read it. */
		__ytmdSleep?: { set: (v: number | "end" | "off") => void; state: () => SleepTimer & { fading: boolean } };
	}
}

const BUTTON_ID = "ytmd-sleep-button";
const STYLE_ID = "ytmd-sleep-style";
const SILENCE_TICK_MS = 250;
// Material "bedtime".
const ICON = "M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z";
const MINUTES = [5, 10, 15, 30, 45, 60, 90];

const CSS = `
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
	border-radius: 50%; color: rgba(255, 255, 255, 0.7); }
#${BUTTON_ID}:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BUTTON_ID}[data-on] { color: #fff; }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BUTTON_ID} svg { width: 20px; height: 20px; fill: currentColor; }
`;

const adShowing = () => !!document.querySelector("#movie_player")?.classList.contains("ad-showing");

const transitionsRenderer: RendererPluginRegistration = {
	id: "transitions",
	enabled: true,
	start(ctx) {
		const engine = getAudioEngine();
		const fade = () => engine.instance<FadeInstance>("fade");
		const crossfade = () => engine.getState().audio.transitions.crossfade;
		const silence = new SilenceTracker();
		let timer: SleepTimer = { kind: "off" };
		let sleepFading = false;
		let fadedOut = false;
		let lastTime = 0;

		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			(document.head ?? document.documentElement).appendChild(style);
		}

		const video = () => document.querySelector<HTMLVideoElement>(MAIN_VIDEO);

		const startTrack = () => {
			fadedOut = false;
			silence.reset();
			if (timer.kind === "end-of-track" && sleepFading) return finishSleep();
			if (sleepFading) return;
			const cf = crossfade();
			if (cf > 0) {
				fade()?.set(0);
				fade()?.fadeTo(1, cf);
			} else fade()?.set(1);
		};

		const onTime = (e: Event) => {
			const v = e.target;
			if (!(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO) || adShowing()) return;
			const ct = v.currentTime;
			if (ct + 1 < lastTime && ct < 2) startTrack();
			lastTime = ct;
			if (sleepFading) return;
			const at = fadeOutAt(v.duration, crossfade());
			if (at != null && ct >= at && !fadedOut) {
				fadedOut = true;
				fade()?.fadeTo(0, Math.max(0.2, v.duration - ct));
			} else if (fadedOut && (at == null || ct < at - 0.5)) {
				// Seeked back from the tail.
				fadedOut = false;
				fade()?.fadeTo(1, 0.3);
			}
		};
		const onLoaded = (e: Event) => {
			if (e.target instanceof HTMLVideoElement && e.target.matches(MAIN_VIDEO) && !adShowing()) {
				lastTime = 0;
				startTrack();
			}
		};

		// ---- sleep timer ----
		const render = () => {
			const btn = document.getElementById(BUTTON_ID);
			if (!btn) return;
			const label = sleepLabel(timer, Date.now());
			btn.title = label;
			btn.setAttribute("aria-label", label);
			btn.toggleAttribute("data-on", timer.kind !== "off");
		};
		const setTimer = (next: SleepTimer) => {
			if (sleepFading) fade()?.fadeTo(1, 0.5);
			timer = next;
			sleepFading = false;
			engine.setRuntime({ fadeWanted: next.kind !== "off" });
			render();
		};
		const finishSleep = () => {
			const player = getPagePlayerApi();
			if (player) player.pauseVideo();
			else video()?.pause();
			timer = { kind: "off" };
			sleepFading = false;
			fade()?.set(1);
			engine.setRuntime({ fadeWanted: false });
			render();
		};
		const sleepTick = () => {
			const v = video();
			const remaining = v ? v.duration - v.currentTime : Number.NaN;
			const act = sleepAction(timer, Date.now(), remaining, sleepFading);
			if (act === "fade") {
				sleepFading = true;
				fade()?.fadeTo(0, timer.kind === "at" ? Math.max(0.2, (timer.endsAt - Date.now()) / 1000) : Math.min(SLEEP_FADE_S, remaining));
			} else if (act === "pause") finishSleep();
			else if (timer.kind === "at") render();
		};
		const sleepInterval = window.setInterval(sleepTick, 1000);

		const mount = () => {
			if (document.getElementById(BUTTON_ID)) return;
			const anchor =
				document.getElementById("ytmd-output-button") ?? document.getElementById("ytmd-speed-button") ?? document.getElementById("ytmd-av-bar-button");
			if (!anchor?.parentElement) return;
			const btn = document.createElement("button");
			btn.id = BUTTON_ID;
			btn.type = "button";
			setIcon(btn, ICON);
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				openMenu(btn, "Sleep timer", [
					{ label: "Off", checked: timer.kind === "off", onSelect: () => setTimer({ kind: "off" }) },
					...MINUTES.map((m) => ({ label: `${m} minutes`, onSelect: () => setTimer({ kind: "at", endsAt: Date.now() + m * 60_000 }) })),
					{ label: "End of track", checked: timer.kind === "end-of-track", onSelect: () => setTimer({ kind: "end-of-track" }) },
				]);
			});
			anchor.insertAdjacentElement("afterend", btn);
			render();
		};
		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);
		mount();

		window.__ytmdSleep = {
			set: (v) => setTimer(v === "off" ? { kind: "off" } : v === "end" ? { kind: "end-of-track" } : { kind: "at", endsAt: Date.now() + v }),
			state: () => ({ ...timer, fading: sleepFading }),
		};

		// ---- skip silence ----
		const silenceTick = () => {
			if (!engine.getState().audio.transitions.skipSilence) return;
			const v = video();
			if (!v || v.paused || v.seeking || v.muted || adShowing()) return silence.reset();
			const act = silence.feed(analyserLevel(), Date.now(), v.currentTime, v.duration);
			if (act === "skip") v.currentTime = Math.min(v.duration - 0.5, v.currentTime + SKIP_STEP_S);
			else if (act === "next") {
				silence.reset();
				getPagePlayerApi()?.nextVideo();
			}
		};
		const silenceInterval = window.setInterval(silenceTick, SILENCE_TICK_MS);

		document.addEventListener("timeupdate", onTime, true);
		document.addEventListener("loadeddata", onLoaded, true);

		return () => {
			window.clearInterval(sleepInterval);
			window.clearInterval(silenceInterval);
			window.clearInterval(remount);
			document.removeEventListener("timeupdate", onTime, true);
			document.removeEventListener("loadeddata", onLoaded, true);
			document.getElementById(BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
			delete window.__ytmdSleep;
			ctx.log.debug("transitions stopped");
		};
	},
};

export default transitionsRenderer;
