import { normalizeAudio } from "@shared/audio/settings";
import type { GraphInfo } from "./audio-engine/engine";
import { analyserBandDb, analyserLevel, getAudioEngine, MAIN_VIDEO, setEngineHooks, stageName } from "./audio-engine/instance";
import { pageToast } from "./page-toast";
import type { RendererPluginRegistration } from "./world0/types";

// Audio engine (roadmap D1), page side: feeds the engine the saved `audio` settings, the player's <video>, the
// track's loudness and user gestures, and reports the chain. Main grants a gesture when the context can't start
// on its own (the app's autoplay policy needs one), see main/trpc/routers/audio/service.ts.

declare global {
	interface Window {
		/** Test and main hooks: the chain, an analyser level reading, and a resume called with a user gesture. */
		__ytmdAudio?: {
			info: () => GraphInfo;
			level: () => number | null;
			band: (fromHz: number, toHz: number) => number | null;
			setAnalyser: (on: boolean) => void;
			resume: () => void;
		};
	}
}

function readLoudness(): number | null {
	const player = document.querySelector("#movie_player") as
		| (Element & { getPlayerResponse?: () => { playerConfig?: { audioConfig?: { loudnessDb?: unknown } } } })
		| null;
	try {
		const db = player?.getPlayerResponse?.()?.playerConfig?.audioConfig?.loudnessDb;
		return typeof db === "number" && Number.isFinite(db) ? db : null;
	} catch {
		return null;
	}
}

const audioEngineRenderer: RendererPluginRegistration = {
	id: "audio-engine",
	enabled: true,
	start(ctx) {
		const engine = getAudioEngine();
		let askedGesture = false;

		setEngineHooks({
			onError(id, err) {
				ctx.log.error(`stage ${id} failed`, err);
				pageToast(`${stageName(id)} was turned off after an error.`);
			},
			onGraph(info) {
				window.dispatchEvent(new CustomEvent("ytmd:audio-graph", { detail: info }));
				ctx.ytmd?.emit("audio:graph", info);
				// Stages are wanted but the context can't start without a gesture: ask main for one, once per wait.
				const waiting = !info.attached && engine.context?.state === "suspended";
				if (waiting && !askedGesture) {
					askedGesture = true;
					ctx.ytmd?.emit("audio:gesture-needed");
				} else if (!waiting) askedGesture = false;
			},
		});

		window.__ytmdAudio = {
			info: () => engine.info(),
			level: analyserLevel,
			band: analyserBandDb,
			setAnalyser: (on) => engine.setRuntime({ analyserWanted: on }),
			resume: () => engine.resume(),
		};

		const loadSettings = async () => {
			try {
				const audio = normalizeAudio(await ctx.ytmd?.settings.get("audio"));
				engine.setState({ ...engine.getState(), audio });
			} catch (err) {
				ctx.log.warn("audio settings unavailable", err);
			}
		};
		let reload = 0;
		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key) => {
				if (typeof key !== "string" || (key !== "audio" && !key.startsWith("audio."))) return;
				window.clearTimeout(reload);
				reload = window.setTimeout(loadSettings, 30);
			}) ?? (() => undefined);
		void loadSettings();

		const onMedia = (e: Event) => {
			const v = e.target;
			if (!(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO)) return;
			engine.setElement(v);
			if (e.type === "loadeddata") engine.setRuntime({ loudnessDb: readLoudness() });
		};
		const onGesture = () => engine.resume();
		document.addEventListener("loadeddata", onMedia, true);
		document.addEventListener("playing", onMedia, true);
		document.addEventListener("pointerdown", onGesture, true);
		document.addEventListener("keydown", onGesture, true);
		engine.setElement(document.querySelector<HTMLVideoElement>(MAIN_VIDEO));

		return () => {
			offSettings();
			window.clearTimeout(reload);
			document.removeEventListener("loadeddata", onMedia, true);
			document.removeEventListener("playing", onMedia, true);
			document.removeEventListener("pointerdown", onGesture, true);
			document.removeEventListener("keydown", onGesture, true);
			engine.dispose();
			delete window.__ytmdAudio;
		};
	},
};

export default audioEngineRenderer;
