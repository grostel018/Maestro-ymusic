import { normalizeAudio } from "@shared/audio/settings";
import { describe, expect, it, vi } from "vitest";
import { AudioEngine, type EngineState, type StageDef } from "./engine";
import { FakeContext, type FakeNode, pathKinds, reaches } from "./fake-context";
import { STAGES } from "./stages";

vi.stubGlobal("window", { setInterval: () => 1, clearInterval: () => undefined });

const el = {} as HTMLMediaElement;
const base = (): EngineState => ({ audio: normalizeAudio(undefined), runtime: { loudnessDb: null, fadeWanted: false, analyserWanted: false } });
const withAudio = (patch: (a: EngineState["audio"]) => void): EngineState => {
	const s = base();
	patch(s.audio);
	return s;
};

function setup(state = base(), stages: StageDef[] = STAGES, ctx = new FakeContext()) {
	const errors: string[] = [];
	const engine = new AudioEngine(
		{ createContext: () => ctx as unknown as AudioContext, stages, onError: (id) => errors.push(id), onGraph: () => undefined },
		state,
	);
	const sources = () => ctx.nodes.filter((n) => n.kind === "source");
	return { ctx, engine, errors, source: () => sources()[0] as FakeNode, sources };
}

describe("AudioEngine", () => {
	it("leaves the element native while no stage is on", () => {
		const { engine, ctx, sources } = setup();
		engine.setElement(el);
		expect(sources()).toHaveLength(0);
		expect(engine.attached).toBe(false);
		expect(ctx.nodes).toHaveLength(1); // the destination of an unused fake: no context was asked for anything
	});

	it("builds the chain in the fixed order", () => {
		const { engine, ctx, source } = setup(
			withAudio((a) => {
				a.dynamics.compressor = "gentle";
				a.eq.enabled = true;
				a.eq.bands[0] = 6;
				a.karaoke.enabled = true;
			}),
		);
		engine.setElement(el);
		expect(engine.info().chain).toEqual(["eq", "karaoke", "dynamics"]);
		expect(reaches(source(), ctx.destination)).toBe(true);
		const kinds = pathKinds(source());
		expect(kinds[0]).toBe("source");
		expect(kinds.indexOf("biquad")).toBeLessThan(kinds.indexOf("splitter"));
		expect(kinds.indexOf("splitter")).toBeLessThan(kinds.indexOf("compressor"));
		expect(kinds.at(-1)).toBe("destination");
	});

	it("wires the source straight to the output once every stage is off again", () => {
		const { engine, source } = setup(withAudio((a) => (a.dynamics.compressor = "night")));
		engine.setElement(el);
		engine.setState(base());
		expect(engine.info().chain).toEqual([]);
		expect(engine.attached).toBe(true);
		expect(pathKinds(source())).toEqual(["source", "destination"]);
	});

	it("waits for a running context before routing the element", () => {
		const ctx = new FakeContext();
		ctx.state = "suspended";
		ctx.resume = async () => undefined; // no user gesture yet
		const { engine } = setup(
			withAudio((a) => (a.dynamics.compressor = "gentle")),
			STAGES,
			ctx,
		);
		engine.setElement(el);
		expect(engine.attached).toBe(false);
		ctx.state = "running";
		ctx.onstatechange?.();
		expect(engine.attached).toBe(true);
		expect(engine.info().chain).toEqual(["dynamics"]);
	});

	it("turns a failing stage off, keeps the rest, and retries after its settings change", () => {
		const { engine, ctx, errors, source } = setup();
		ctx.failOn = "compressor";
		engine.setElement(el);
		const both = (compressor: "gentle" | "night") =>
			withAudio((a) => {
				a.dynamics.compressor = compressor;
				a.karaoke.enabled = true;
			});
		engine.setState(both("gentle"));
		expect(errors).toEqual(["dynamics"]);
		expect(engine.info()).toMatchObject({ chain: ["karaoke"], failed: ["dynamics"] });
		expect(reaches(source(), ctx.destination)).toBe(true);
		ctx.failOn = null;
		engine.setState(both("gentle"));
		expect(engine.info().failed).toEqual(["dynamics"]);
		engine.setState(both("night"));
		expect(engine.info()).toMatchObject({ chain: ["karaoke", "dynamics"], failed: [] });
	});

	it("updates a stage in place, and rebuilds it when its shape changes", () => {
		const { engine } = setup(withAudio((a) => ((a.eq.enabled = true), (a.eq.bands[3] = 3))));
		engine.setElement(el);
		const first = engine.instance("eq");
		engine.setState(withAudio((a) => ((a.eq.enabled = true), (a.eq.bands[3] = -4))));
		expect(engine.instance("eq")).toBe(first);
		engine.setState(withAudio((a) => ((a.eq.enabled = true), (a.eq.bands[3] = -4), (a.eq.bands[5] = 2))));
		expect(engine.instance("eq")).not.toBe(first);
	});

	it("re-attaches to a new element and puts the sink on the context", () => {
		const { engine, ctx, sources } = setup(withAudio((a) => (a.dynamics.compressor = "gentle")));
		engine.setSink("dac-1");
		engine.setElement(el);
		expect(ctx.sinkCalls).toEqual(["dac-1"]);
		engine.setElement({} as HTMLMediaElement);
		expect(sources()).toHaveLength(2);
		expect(reaches(sources()[1], ctx.destination)).toBe(true);
		expect(reaches(sources()[0], ctx.destination)).toBe(false);
	});

	it("adds the fade stage for a sleep timer and the analyser tap on request", () => {
		const { engine } = setup();
		engine.setElement(el);
		engine.setRuntime({ analyserWanted: true, fadeWanted: true });
		expect(engine.info().chain).toEqual(["fade", "analyser"]);
	});

	it("builds every stage together without an error", () => {
		const { engine, errors } = setup(
			withAudio((a) => {
				a.dynamics.normalize = true;
				a.eq.enabled = true;
				a.eq.bands[1] = 4;
				a.spatial.crossfeed = "medium";
				a.spatial.width = 150;
				a.spatial.rotate = true;
				a.karaoke.enabled = true;
				a.pitch.semitones = 3;
				a.dynamics.compressor = "gentle";
				a.transitions.crossfade = 4;
				a.visualizer.enabled = true;
			}),
		);
		engine.setElement(el);
		expect(errors).toEqual([]);
		expect(engine.info().chain).toEqual(["input", "eq", "spatial", "karaoke", "pitch", "dynamics", "fade", "analyser"]);
	});
});
