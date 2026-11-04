import type { RendererPluginRegistration } from "./world0/types";

// Video ambient background (roadmap E2, `themes.background: "video"`): the playing video, sampled 4 times a second
// into a 32 × 18 canvas, blended into the last frame (a soft cross-fade) and shown blurred behind the whole page.
// The blurred song artwork (chrome/surface.scss) stays underneath for Song mode and for pauses. Sampling stops while
// the window is hidden, in Song mode and with the video paused. Idea from pear-desktop@7c55260:src/plugins/
// ambient-mode (MIT); written for our surface.

const CANVAS_ID = "ytmd-ambient";
const SAMPLE_MS = 250;
const W = 32;
const H = 18;
const AUDIO_VIEW = "ytmd-audio-view";

const ambientRenderer: RendererPluginRegistration = {
	id: "ambient",
	enabled: true,
	start(ctx) {
		let on = false;
		let timer = 0;

		const canvas = () => document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
		const mount = () => {
			let c = canvas();
			if (c) return c;
			c = document.createElement("canvas");
			c.id = CANVAS_ID;
			c.width = W;
			c.height = H;
			c.setAttribute("aria-hidden", "true");
			Object.assign(c.style, {
				position: "fixed",
				inset: "0",
				width: "100vw",
				height: "100vh",
				zIndex: "-1",
				pointerEvents: "none",
				filter: "blur(40px) saturate(1.3)",
				transform: "scale(1.15)",
				opacity: "0.55",
				transition: "opacity 600ms ease",
			});
			document.body.appendChild(c);
			return c;
		};

		const sample = () => {
			const v = document.querySelector<HTMLVideoElement>("video.html5-main-video, #movie_player video");
			const songMode = document.documentElement.classList.contains(AUDIO_VIEW);
			const c = canvas();
			if (!c) return;
			if (!v || songMode || v.readyState < 2 || !v.videoWidth) {
				c.style.opacity = "0";
				return;
			}
			c.style.opacity = "0.55";
			if (v.paused) return;
			const g = c.getContext("2d");
			if (!g) return;
			g.globalAlpha = 0.35;
			g.drawImage(v, 0, 0, W, H);
		};

		const run = () => {
			window.clearInterval(timer);
			timer = 0;
			if (!on || document.hidden) return;
			mount();
			timer = window.setInterval(sample, SAMPLE_MS);
		};

		const set = (value: unknown) => {
			on = value === "video";
			if (!on) canvas()?.remove();
			run();
		};

		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === "themes.background") set(value);
				else if (key === "themes") set((value as { background?: unknown } | null)?.background);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get("themes.background"))
			.then(set)
			.catch(() => undefined);
		document.addEventListener("visibilitychange", run);

		return () => {
			offSettings();
			document.removeEventListener("visibilitychange", run);
			window.clearInterval(timer);
			canvas()?.remove();
		};
	},
};

export default ambientRenderer;
