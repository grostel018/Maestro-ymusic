// The page's one audio engine, shared by the renderers (audio engine, output device, transitions, visualizer).
import { DEFAULT_AUDIO } from "@shared/audio/settings";
import { AudioEngine, type EngineDeps, type GraphInfo, type StageId } from "./engine";
import { type AnalyserInstance, STAGES } from "./stages";

const STAGE_NAMES: Record<StageId | "output", string> = {
	input: "Loudness normalization",
	eq: "Equalizer",
	spatial: "Spatial audio",
	karaoke: "Vocal reduction",
	pitch: "Pitch shift",
	dynamics: "Compressor",
	fade: "Transitions",
	analyser: "Visualizer",
	output: "The audio engine",
};

export const stageName = (id: StageId | "output") => STAGE_NAMES[id];

/** YouTube Music's player element. */
export const MAIN_VIDEO = "video.html5-main-video, #movie_player video";

type Hooks = { onError: EngineDeps["onError"]; onGraph: EngineDeps["onGraph"] };
const hooks: Hooks = { onError: () => undefined, onGraph: () => undefined };
let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
	engine ??= new AudioEngine(
		{
			createContext: () => new AudioContext({ latencyHint: "playback" }),
			stages: STAGES,
			onError: (id, err) => hooks.onError(id, err),
			onGraph: (info: GraphInfo) => hooks.onGraph(info),
		},
		{ audio: DEFAULT_AUDIO, runtime: { loudnessDb: null, fadeWanted: false, analyserWanted: false } },
	);
	return engine;
}

export function setEngineHooks(next: Partial<Hooks>): void {
	Object.assign(hooks, next);
}

/** RMS level (dBFS) at the analyser tap, or null without one. */
export function analyserLevel(): number | null {
	const a = engine?.instance<AnalyserInstance>("analyser")?.analyser;
	if (!a) return null;
	const data = new Float32Array(a.fftSize);
	a.getFloatTimeDomainData(data);
	let sum = 0;
	for (const v of data) sum += v * v;
	const rms = Math.sqrt(sum / data.length);
	return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
}

/** Mean power (dB) at the analyser tap between two frequencies, or null without one. */
export function analyserBandDb(fromHz: number, toHz: number): number | null {
	const a = engine?.instance<AnalyserInstance>("analyser")?.analyser;
	if (!a) return null;
	const data = new Float32Array(a.frequencyBinCount);
	a.getFloatFrequencyData(data);
	const hzPerBin = a.context.sampleRate / 2 / a.frequencyBinCount;
	const from = Math.max(0, Math.floor(fromHz / hzPerBin));
	const to = Math.min(data.length, Math.max(from + 1, Math.ceil(toHz / hzPerBin)));
	let power = 0;
	for (let i = from; i < to; i++) power += 10 ** (data[i] / 10);
	return 10 * Math.log10(power / (to - from));
}
