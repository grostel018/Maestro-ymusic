import { getAudioEngine } from "./audio-engine/instance";
import type { AnalyserInstance } from "./audio-engine/stages";
import type { RendererPluginRegistration } from "./world0/types";

// Beat for the lyrics glow (lyrics/ui/apple.ts): the bass level of what is playing, 0-1, written as `--ytmd-al-beat`
// on each glowing lyrics view. The lyrics run in the preload's isolated world and the audio engine here, so the level
// crosses through the shared DOM. Runs only while a glowing view is on screen and the window is visible, at most
// 30 fps; `lyrics.glowBeat` off (or no analyser yet) leaves the CSS default, a steady glow.

const SETTING = "lyrics.glowBeat";
const ROOTS = ".ytmd-al.glow, #ytmd-karaoke";
const FRAME_MS = 1000 / 30;
const LOW_HZ = 40;
const HIGH_HZ = 200;
/** Smoothing per frame: rises fast on a kick, falls slowly. */
const ATTACK = 0.6;
const RELEASE = 0.12;
const MIN_STEP = 0.02;

const lyricsBeatRenderer: RendererPluginRegistration = {
	id: "lyrics-beat",
	enabled: true,
	start(ctx) {
		const engine = getAudioEngine();
		let enabled = true;
		let raf = 0;
		let last = 0;
		let level = 0;
		let written = -1;
		let wanted = false;
		let freq: Uint8Array<ArrayBuffer> | null = null;

		const roots = () => document.querySelectorAll<HTMLElement>(ROOTS);
		const write = (value: number | null) => {
			for (const r of roots()) {
				if (value === null) r.style.removeProperty("--ytmd-al-beat");
				else r.style.setProperty("--ytmd-al-beat", value.toFixed(2));
			}
		};

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			if (now - last < FRAME_MS) return;
			last = now;
			const a = engine.instance<AnalyserInstance>("analyser")?.analyser;
			if (!a) return;
			if (freq?.length !== a.frequencyBinCount) freq = new Uint8Array(a.frequencyBinCount);
			a.getByteFrequencyData(freq);
			const hzPerBin = a.context.sampleRate / 2 / a.frequencyBinCount;
			const from = Math.max(1, Math.floor(LOW_HZ / hzPerBin));
			const to = Math.max(from + 1, Math.ceil(HIGH_HZ / hzPerBin));
			let peak = 0;
			for (let k = from; k < to; k++) peak = Math.max(peak, freq[k]);
			// Quiet bass sits around 120-150 of 255: stretch the top so kicks stand out.
			const target = Math.min(1, Math.max(0, (peak - 110) / 130));
			level += (target - level) * (target > level ? ATTACK : RELEASE);
			if (Math.abs(level - written) >= MIN_STEP) {
				written = level;
				write(level);
			}
		};

		const stop = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			if (wanted) engine.setRuntime({ analyserWanted: false });
			wanted = false;
			if (written >= 0) write(null);
			written = -1;
		};

		/** Starts or stops as the setting, the lyrics view and the window change. */
		const check = () => {
			const want = enabled && !document.hidden && [...roots()].some((r) => r.isConnected && r.getClientRects().length > 0);
			if (!want) return stop();
			if (!wanted) engine.setRuntime({ analyserWanted: true });
			wanted = true;
			if (!raf) raf = requestAnimationFrame(frame);
		};
		const interval = window.setInterval(check, 1000);
		document.addEventListener("visibilitychange", check);

		const setEnabled = (value: unknown) => {
			enabled = value !== false;
			check();
		};
		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === SETTING) setEnabled(value);
				else if (key === "lyrics") setEnabled((value as { glowBeat?: unknown } | null)?.glowBeat);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get(SETTING))
			.then(setEnabled)
			.catch(() => undefined);

		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", check);
			offSettings();
			stop();
		};
	},
};

export default lyricsBeatRenderer;
