// Audio engine core (roadmap D1): one AudioContext, one MediaElementSource per <video>, and a fixed, ordered chain
// of optional stages. Built here, not ported: Pear's plugins each wire themselves into the graph, so their order
// is fragile (docs/REUSE.md).
//
// A MediaElementSource can never be undone, so the engine attaches only when the first stage turns on, and only
// while the context runs (a suspended context would mute the page). With every stage off it wires the source
// straight to the output. A stage that throws is switched off and reported; the rest keep playing.
import type { AudioSettings } from "@shared/audio/settings";

export const CHAIN = ["input", "eq", "spatial", "karaoke", "pitch", "dynamics", "fade", "analyser"] as const;
export type StageId = (typeof CHAIN)[number];

/** Per-session facts the saved settings don't hold. */
export type Runtime = {
	/** YouTube's loudness for the current track (dB relative to its target), when known. */
	loudnessDb: number | null;
	/** The fade stage is needed for a sleep timer even with crossfade off. */
	fadeWanted: boolean;
	/** The analyser tap is needed (visualizer open, silence skipping, tests). */
	analyserWanted: boolean;
};

export type EngineState = { audio: AudioSettings; runtime: Runtime };

export interface StageInstance {
	input: AudioNode;
	output: AudioNode;
	/** Applies new settings in place; `false` asks the engine to build the stage again (a change of shape). */
	update(state: EngineState): void | boolean;
	dispose(): void;
}

export interface StageDef {
	id: StageId;
	wants(state: EngineState): boolean;
	/** The part of the state this stage reads; a change clears an earlier failure. */
	key(state: EngineState): unknown;
	create(ctx: BaseAudioContext, state: EngineState): StageInstance;
}

export type GraphInfo = { attached: boolean; running: boolean; chain: StageId[]; failed: StageId[]; sinkId: string };

type SinkContext = AudioContext & { sinkId?: string | object; setSinkId?: (id: string) => Promise<void> };

export type EngineDeps = {
	createContext: () => AudioContext;
	stages: StageDef[];
	onError: (id: StageId | "output", err: unknown) => void;
	onGraph: (info: GraphInfo) => void;
};

const keyOf = (v: unknown) => JSON.stringify(v ?? null);

export class AudioEngine {
	private ctx: SinkContext | null = null;
	private el: HTMLMediaElement | null = null;
	private readonly sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
	private source: MediaElementAudioSourceNode | null = null;
	private readonly live = new Map<StageId, StageInstance>();
	/** Failed stages, with the key they failed at. */
	private readonly failed = new Map<StageId, string>();
	private readonly defs: Map<StageId, StageDef>;
	private sinkId = "";
	private lastGraph = "";

	constructor(
		private readonly deps: EngineDeps,
		private state: EngineState,
	) {
		this.defs = new Map(deps.stages.map((s) => [s.id, s]));
	}

	get context(): AudioContext | null {
		return this.ctx;
	}

	get attached(): boolean {
		return !!this.source;
	}

	instance<T extends StageInstance = StageInstance>(id: StageId): T | undefined {
		return this.live.get(id) as T | undefined;
	}

	getState(): EngineState {
		return this.state;
	}

	setElement(el: HTMLMediaElement | null): void {
		if (el === this.el) return;
		this.el = el;
		this.sync();
	}

	setState(state: EngineState): void {
		for (const [id, at] of this.failed) {
			const def = this.defs.get(id);
			if (def && keyOf(def.key(state)) !== at) this.failed.delete(id);
		}
		this.state = state;
		this.sync();
	}

	setRuntime(patch: Partial<Runtime>): void {
		this.setState({ ...this.state, runtime: { ...this.state.runtime, ...patch } });
	}

	/** "" is the system default. */
	setSink(sinkId: string): void {
		this.sinkId = sinkId;
		this.applySink();
		this.emit();
	}

	/** Called on a user gesture: a context that could not start before may start now. */
	resume(): void {
		if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => undefined);
		else if (!this.ctx && this.wanted().length) this.sync();
	}

	info(): GraphInfo {
		return {
			attached: this.attached,
			running: this.ctx?.state === "running",
			chain: CHAIN.filter((id) => this.live.has(id)),
			failed: [...this.failed.keys()],
			sinkId: this.sinkId,
		};
	}

	private wanted(): StageId[] {
		return CHAIN.filter((id) => {
			const def = this.defs.get(id);
			if (!def || this.failed.has(id)) return false;
			try {
				return def.wants(this.state);
			} catch {
				return false;
			}
		});
	}

	private ensureContext(): SinkContext | null {
		if (this.ctx) return this.ctx;
		try {
			const ctx = this.deps.createContext() as SinkContext;
			ctx.onstatechange = () => this.sync();
			this.ctx = ctx;
			this.applySink();
			return ctx;
		} catch (err) {
			this.deps.onError("output", err);
			return null;
		}
	}

	private applySink(): void {
		const ctx = this.ctx;
		if (!ctx?.setSinkId) return;
		const current = typeof ctx.sinkId === "string" ? ctx.sinkId : "";
		if (current === this.sinkId) return;
		ctx.setSinkId(this.sinkId).catch((err) => {
			this.deps.onError("output", err);
			if (this.sinkId) ctx.setSinkId?.("").catch(() => undefined);
		});
	}

	sync(): void {
		const want = this.wanted();
		const el = this.el;
		const routed = !!el && this.sources.has(el);
		if (!el || (!want.length && !routed)) {
			// Nothing to do yet, or the element plays natively: leave it alone.
			if (!el) this.detachSource();
			this.dropStages(new Set());
			this.emit();
			return;
		}
		const ctx = this.ensureContext();
		if (!ctx) return this.emit();
		if (ctx.state !== "running") {
			void ctx.resume().catch(() => undefined);
			// Not routed yet: keep the native output until the context runs (onstatechange calls back).
			if (!routed) return this.emit();
		}
		let source = this.sources.get(el);
		if (!source) {
			try {
				source = ctx.createMediaElementSource(el);
			} catch (err) {
				this.deps.onError("output", err);
				return this.emit();
			}
			this.sources.set(el, source);
		}
		if (this.source && this.source !== source) this.detachSource();
		this.source = source;

		const wantSet = new Set(want);
		this.dropStages(wantSet);
		for (const id of want) {
			const def = this.defs.get(id);
			if (!def) continue;
			const inst = this.live.get(id);
			try {
				if (inst && inst.update(this.state) !== false) continue;
				if (inst) {
					this.live.delete(id);
					inst.output.disconnect();
					inst.dispose();
				}
				this.live.set(id, def.create(ctx, this.state));
			} catch (err) {
				this.fail(id, err);
			}
		}
		this.rewire();
		this.emit();
	}

	private dropStages(keep: Set<StageId>): void {
		for (const [id, inst] of this.live) {
			if (keep.has(id)) continue;
			this.live.delete(id);
			try {
				inst.output.disconnect();
				inst.dispose();
			} catch {
				/* already gone */
			}
		}
	}

	private detachSource(): void {
		try {
			this.source?.disconnect();
		} catch {
			/* ignore */
		}
		this.source = null;
	}

	private fail(id: StageId, err: unknown): void {
		const def = this.defs.get(id);
		this.failed.set(id, keyOf(def?.key(this.state)));
		const inst = this.live.get(id);
		this.live.delete(id);
		try {
			inst?.output.disconnect();
			inst?.dispose();
		} catch {
			/* ignore */
		}
		this.deps.onError(id, err);
	}

	private rewire(): void {
		const ctx = this.ctx;
		const source = this.source;
		if (!ctx || !source) return;
		source.disconnect();
		for (const inst of this.live.values()) inst.output.disconnect();
		let prev: AudioNode = source;
		for (const id of CHAIN) {
			const inst = this.live.get(id);
			if (!inst) continue;
			prev.connect(inst.input);
			prev = inst.output;
		}
		prev.connect(ctx.destination);
	}

	private emit(): void {
		const info = this.info();
		const sig = keyOf(info);
		if (sig === this.lastGraph) return;
		this.lastGraph = sig;
		try {
			this.deps.onGraph(info);
		} catch {
			// A reporting failure must never break the audio path.
		}
	}

	/** Tears the graph down to a plain source → output (the element stays routed; Web Audio can't undo that). */
	dispose(): void {
		this.dropStages(new Set());
		this.rewire();
	}
}
