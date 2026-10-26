import { adoptSpeed, applySpeed, configureSpeed, getSpeed, onSpeedChange, openSpeedMenu, setKeepPitch } from "./playback-speed";
import { speedLabel } from "./video-controls.logic";
import type { RendererPluginRegistration } from "./world0/types";

// Speed and keep-pitch (roadmap C4): a player-bar button with the speed menu, so it works in Song mode too; the
// video controls (C2) open the same menu. The rate holds for the session and is put back on every new track.

const PITCH_SETTING = "player.keepPitch";
const BUTTON_ID = "ytmd-speed-button";
const STYLE_ID = "ytmd-speed-style";
/** A rate change this soon after a new source is the player resetting it, not the user. */
const LOAD_GRACE_MS = 2000;

const CSS = `
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 40px;
	padding: 0 6px; box-sizing: border-box; border-radius: 20px; font: 500 13px/1 "YouTube Sans", Roboto, sans-serif; color: rgba(255, 255, 255, 0.7); }
#${BUTTON_ID}:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BUTTON_ID}[data-changed] { color: #fff; }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const playbackSpeedRenderer: RendererPluginRegistration = {
	id: "playback-speed",
	enabled: true,
	start(ctx) {
		let loadedAt = 0;

		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			(document.head ?? document.documentElement).appendChild(style);
		}

		configureSpeed({ persistKeepPitch: (value) => ctx.ytmd?.settings.set(PITCH_SETTING, value) });

		const render = () => {
			const btn = document.getElementById(BUTTON_ID);
			if (!btn) return;
			const rate = getSpeed();
			btn.textContent = rate === 1 ? "1×" : speedLabel(rate);
			btn.title = `Playback speed: ${speedLabel(rate)}`;
			btn.setAttribute("aria-label", btn.title);
			btn.toggleAttribute("data-changed", rate !== 1);
		};

		/** Next to the Song/Video button (video-mode.renderer.ts finds the right spot in both player-bar layouts). */
		const mount = () => {
			if (document.getElementById(BUTTON_ID)) return;
			const av = document.getElementById("ytmd-av-bar-button");
			if (!av?.parentElement) return;
			const btn = document.createElement("button");
			btn.id = BUTTON_ID;
			btn.type = "button";
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				openSpeedMenu(btn);
			});
			av.insertAdjacentElement("afterend", btn);
			render();
		};

		// Media events don't bubble; capture sees them for whichever <video> YTM uses.
		const onSource = () => {
			loadedAt = Date.now();
			applySpeed();
		};
		const onRate = (e: Event) => {
			const v = e.target as HTMLVideoElement;
			if (Date.now() - loadedAt < LOAD_GRACE_MS) applySpeed();
			else adoptSpeed(v.playbackRate);
		};
		document.addEventListener("loadeddata", onSource, true);
		document.addEventListener("playing", applySpeed, true);
		document.addEventListener("ratechange", onRate, true);
		const offChange = onSpeedChange(render);

		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);
		mount();

		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === PITCH_SETTING) setKeepPitch(value !== false, false);
				else if (key === "player") setKeepPitch((value as { keepPitch?: unknown } | null)?.keepPitch !== false, false);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get(PITCH_SETTING))
			.then((value) => setKeepPitch(value !== false, false))
			.catch(() => undefined);

		return () => {
			window.clearInterval(remount);
			offSettings();
			offChange();
			configureSpeed({ persistKeepPitch: null });
			document.removeEventListener("loadeddata", onSource, true);
			document.removeEventListener("playing", applySpeed, true);
			document.removeEventListener("ratechange", onRate, true);
			document.getElementById(BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default playbackSpeedRenderer;
