import { logBins } from "./audio-engine/dsp";
import { getAudioEngine } from "./audio-engine/instance";
import type { AnalyserInstance } from "./audio-engine/stages";
import type { RendererPluginRegistration } from "./world0/types";

// Visualizer (roadmap D7): bars or a wave drawn on a canvas over the bottom of the player, from the engine's
// analyser tap. Off by default (`audio.visualizer`); drawn at most 30 fps, and only while the player page is open
// and the window visible, so it costs nothing otherwise. Idea from pear-desktop@7c55260:src/plugins/visualizer
// (MIT); Butterchurn is not included (backlog).

const CANVAS_ID = "ytmd-visualizer";
const FRAME_MS = 1000 / 30;
const BARS = 48;

const playerOpen = () => !!document.querySelector("ytmusic-app-layout[player-page-open]");

const visualizerRenderer: RendererPluginRegistration = {
	id: "visualizer",
	enabled: true,
	start() {
		const engine = getAudioEngine();
		let raf = 0;
		let last = 0;
		let freq: Uint8Array<ArrayBuffer> | null = null;
		let wave: Uint8Array<ArrayBuffer> | null = null;
		let bins: Array<[number, number]> = [];

		const canvas = () => document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;

		const mount = (): HTMLCanvasElement | null => {
			const host = document.querySelector("ytmusic-player#player") ?? document.querySelector("ytmusic-player");
			if (!host) return null;
			let c = canvas();
			if (c && c.parentElement === host) return c;
			c?.remove();
			c = document.createElement("canvas");
			c.id = CANVAS_ID;
			c.setAttribute("aria-hidden", "true");
			Object.assign(c.style, { position: "absolute", left: "0", right: "0", bottom: "0", width: "100%", height: "28%", pointerEvents: "none", zIndex: "5" });
			if (getComputedStyle(host).position === "static") (host as HTMLElement).style.position = "relative";
			host.appendChild(c);
			return c;
		};

		const draw = (now: number) => {
			raf = requestAnimationFrame(draw);
			if (now - last < FRAME_MS) return;
			last = now;
			const a = engine.instance<AnalyserInstance>("analyser")?.analyser;
			const c = canvas();
			const g = c?.getContext("2d");
			if (!a || !c || !g) return;
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			const w = Math.round(c.clientWidth * dpr);
			const h = Math.round(c.clientHeight * dpr);
			if (c.width !== w || c.height !== h) {
				c.width = w;
				c.height = h;
			}
			g.clearRect(0, 0, w, h);
			g.fillStyle = g.strokeStyle = "rgba(255, 255, 255, 0.55)";
			if (engine.getState().audio.visualizer.style === "wave") {
				if (wave?.length !== a.fftSize) wave = new Uint8Array(a.fftSize);
				a.getByteTimeDomainData(wave);
				g.lineWidth = 2 * dpr;
				g.beginPath();
				for (let i = 0; i < wave.length; i += 4) {
					const x = (i / (wave.length - 1)) * w;
					const y = (wave[i] / 255) * h;
					if (i === 0) g.moveTo(x, y);
					else g.lineTo(x, y);
				}
				g.stroke();
				return;
			}
			if (freq?.length !== a.frequencyBinCount) {
				freq = new Uint8Array(a.frequencyBinCount);
				bins = logBins(BARS, a.frequencyBinCount, a.context.sampleRate);
			}
			a.getByteFrequencyData(freq);
			const gap = 2 * dpr;
			const bw = (w - gap * (BARS - 1)) / BARS;
			bins.forEach(([from, to], i) => {
				let peak = 0;
				for (let k = from; k < to; k++) peak = Math.max(peak, freq?.[k] ?? 0);
				const bh = (peak / 255) * h;
				g.fillRect(i * (bw + gap), h - bh, bw, bh);
			});
		};

		const stop = () => {
			cancelAnimationFrame(raf);
			raf = 0;
			canvas()?.remove();
		};

		/** Starts or stops the loop as the setting, the player page and the window change. */
		const check = () => {
			const want = engine.getState().audio.visualizer.enabled && playerOpen() && !document.hidden;
			if (!want) return stop();
			if (!mount()) return;
			if (!raf) raf = requestAnimationFrame(draw);
		};
		const interval = window.setInterval(check, 1000);
		document.addEventListener("visibilitychange", check);
		check();

		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", check);
			stop();
		};
	},
};

export default visualizerRenderer;
