// Test double for Web Audio: nodes record their connections so a test can walk the graph from the source.
type Edge = { to: FakeNode | FakeParam };

export class FakeParam {
	value = 0;
	setTargetAtTime(v: number) {
		this.value = v;
	}
	setValueAtTime(v: number) {
		this.value = v;
	}
	linearRampToValueAtTime(v: number) {
		this.value = v;
	}
	cancelScheduledValues() {}
}

export class FakeNode {
	edges: Edge[] = [];
	constructor(
		readonly kind: string,
		ctx: FakeContext,
	) {
		ctx.nodes.push(this);
	}
	connect(to: FakeNode | FakeParam) {
		this.edges.push({ to });
		return to;
	}
	disconnect() {
		this.edges = [];
	}
}

export class FakeContext {
	state: "running" | "suspended" = "running";
	sampleRate = 48000;
	currentTime = 0;
	sinkId = "";
	nodes: FakeNode[] = [];
	readonly destination: FakeNode;
	onstatechange: (() => void) | null = null;
	failOn: string | null = null;
	sinkCalls: string[] = [];

	constructor() {
		this.destination = new FakeNode("destination", this);
	}

	private make(kind: string, params: string[] = []) {
		if (this.failOn === kind) throw new Error(`boom ${kind}`);
		const n = new FakeNode(kind, this) as FakeNode & Record<string, unknown>;
		for (const p of params) n[p] = new FakeParam();
		return n;
	}
	async resume() {
		this.state = "running";
		this.onstatechange?.();
	}
	async setSinkId(id: string) {
		this.sinkCalls.push(id);
		this.sinkId = id;
	}
	createMediaElementSource() {
		return this.make("source");
	}
	createGain() {
		const n = this.make("gain", ["gain"]);
		(n.gain as FakeParam).value = 1;
		return n;
	}
	createBiquadFilter() {
		return this.make("biquad", ["frequency", "Q", "gain"]);
	}
	createDynamicsCompressor() {
		return this.make("compressor", ["threshold", "knee", "ratio", "attack", "release"]);
	}
	createChannelSplitter() {
		return this.make("splitter");
	}
	createChannelMerger() {
		return this.make("merger");
	}
	createDelay() {
		return this.make("delay", ["delayTime"]);
	}
	createPanner() {
		return this.make("panner", ["positionX", "positionY", "positionZ"]);
	}
	createAnalyser() {
		return this.make("analyser");
	}
	createBuffer(_channels: number, length: number) {
		const data = new Float32Array(length);
		return { getChannelData: () => data };
	}
	createBufferSource() {
		const n = this.make("buffer-source");
		n.start = () => undefined;
		n.stop = () => undefined;
		return n;
	}
}

/** Kinds along the first path from `from` to the destination. */
export function pathKinds(from: FakeNode): string[] {
	const out: string[] = [];
	let cur: FakeNode | undefined = from;
	const seen = new Set<FakeNode>();
	while (cur && !seen.has(cur)) {
		seen.add(cur);
		out.push(cur.kind);
		if (cur.kind === "destination") break;
		cur = cur.edges.map((e) => e.to).find((t): t is FakeNode => t instanceof FakeNode);
	}
	return out;
}

/** Whether `to` is reachable from `from`. */
export function reaches(from: FakeNode, to: FakeNode): boolean {
	const stack = [from];
	const seen = new Set<FakeNode>();
	while (stack.length) {
		const n = stack.pop() as FakeNode;
		if (n === to) return true;
		if (seen.has(n)) continue;
		seen.add(n);
		for (const e of n.edges) if (e.to instanceof FakeNode) stack.push(e.to);
	}
	return false;
}
