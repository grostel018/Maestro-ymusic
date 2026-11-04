// The engine's stages (roadmap D2–D7), in chain order. Each builds a small Web Audio graph and updates it in
// place; a change of shape (a filter added, surround switched on) rebuilds it. Numbers come from dsp.ts and
// @shared/audio/eq.ts.
import { eqFilters, totalPreamp } from "@shared/audio/eq";
import type { EqFilter } from "@shared/audio/settings";
import { circlePosition, compressorParams, crossfeedParams, dbToGain, normalizeGainDb, pitchMult, widthMatrix } from "./dsp";
import type { EngineState, StageDef, StageInstance } from "./engine";

const RAMP = 0.02;

function setParam(param: AudioParam, value: number, ctx: BaseAudioContext): void {
	param.setTargetAtTime(value, ctx.currentTime, RAMP);
}

// ---- input: loudness normalization (D4) ----

const input: StageDef = {
	id: "input",
	wants: (s) => s.audio.dynamics.normalize,
	key: (s) => s.audio.dynamics.normalize,
	create(ctx, s) {
		const gain = ctx.createGain();
		const apply = (st: EngineState) => setParam(gain.gain, dbToGain(normalizeGainDb(st.runtime.loudnessDb)), ctx);
		gain.gain.value = dbToGain(normalizeGainDb(s.runtime.loudnessDb));
		return { input: gain, output: gain, update: apply, dispose: () => gain.disconnect() };
	},
};

// ---- eq (D2) ----

function eqShape(s: EngineState): EqFilter[] {
	return eqFilters(s.audio.eq).filters;
}

const eq: StageDef = {
	id: "eq",
	wants: (s) => s.audio.eq.enabled && (eqShape(s).length > 0 || s.audio.eq.preamp !== 0),
	key: (s) => s.audio.eq,
	create(ctx, s) {
		const pre = ctx.createGain();
		let filters = eqShape(s);
		const nodes = filters.map((f) => {
			const n = ctx.createBiquadFilter();
			n.type = f.type;
			n.frequency.value = f.frequency;
			n.Q.value = f.q;
			n.gain.value = f.gain;
			return n;
		});
		let prev: AudioNode = pre;
		for (const n of nodes) {
			prev.connect(n);
			prev = n;
		}
		pre.gain.value = dbToGain(totalPreamp(s.audio.eq, ctx.sampleRate));
		return {
			input: pre,
			output: prev,
			update(st) {
				const next = eqShape(st);
				if (next.length !== filters.length || next.some((f, i) => f.type !== filters[i].type)) return false;
				filters = next;
				next.forEach((f, i) => {
					setParam(nodes[i].frequency, f.frequency, ctx);
					setParam(nodes[i].Q, f.q, ctx);
					setParam(nodes[i].gain, f.gain, ctx);
				});
				setParam(pre.gain, dbToGain(totalPreamp(st.audio.eq, ctx.sampleRate)), ctx);
				return true;
			},
			dispose() {
				pre.disconnect();
				for (const n of nodes) n.disconnect();
			},
		};
	},
};

// ---- spatial (D3): width, crossfeed, virtual surround, 8D rotation ----

const SURROUND_DEG = 55;
const ROTATE_TICK_MS = 50;

const spatialShape = (s: EngineState) => {
	const sp = s.audio.spatial;
	return { crossfeed: sp.crossfeed !== "off", panners: sp.surround || sp.rotate, rotate: sp.rotate };
};

const spatial: StageDef = {
	id: "spatial",
	wants: (s) => {
		const sp = s.audio.spatial;
		return sp.crossfeed !== "off" || sp.width !== 100 || sp.surround || sp.rotate;
	},
	key: (s) => s.audio.spatial,
	create(ctx, s) {
		const shape = spatialShape(s);
		const all: AudioNode[] = [];
		const node = <T extends AudioNode>(n: T) => (all.push(n), n);
		const split = node(ctx.createChannelSplitter(2));
		const sumL = node(ctx.createGain());
		const sumR = node(ctx.createGain());
		// Width: a 2×2 mix of the two channels.
		const ll = node(ctx.createGain());
		const lr = node(ctx.createGain());
		const rl = node(ctx.createGain());
		const rr = node(ctx.createGain());
		split.connect(ll, 0);
		split.connect(lr, 0);
		split.connect(rr, 1);
		split.connect(rl, 1);
		ll.connect(sumL);
		rl.connect(sumL);
		rr.connect(sumR);
		lr.connect(sumR);
		const setWidth = (st: EngineState) => {
			const m = widthMatrix(st.audio.spatial.width);
			for (const g of [ll, rr]) setParam(g.gain, m.direct, ctx);
			for (const g of [lr, rl]) setParam(g.gain, m.cross, ctx);
		};
		const m0 = widthMatrix(s.audio.spatial.width);
		ll.gain.value = rr.gain.value = m0.direct;
		lr.gain.value = rl.gain.value = m0.cross;

		let outL: AudioNode = sumL;
		let outR: AudioNode = sumR;
		const feeds: Array<{ lp: BiquadFilterNode; gain: GainNode }> = [];
		if (shape.crossfeed) {
			const p = crossfeedParams(s.audio.spatial.crossfeed);
			const mixL = node(ctx.createGain());
			const mixR = node(ctx.createGain());
			sumL.connect(mixL);
			sumR.connect(mixR);
			for (const [from, to] of [
				[sumL, mixR],
				[sumR, mixL],
			] as const) {
				const lp = node(ctx.createBiquadFilter());
				lp.type = "lowpass";
				lp.frequency.value = p?.cutoffHz ?? 700;
				const delay = node(ctx.createDelay(0.01));
				delay.delayTime.value = p?.delayS ?? 0.0003;
				const gain = node(ctx.createGain());
				gain.gain.value = dbToGain(-(p?.feedDb ?? 6));
				from.connect(lp);
				lp.connect(delay);
				delay.connect(gain);
				gain.connect(to);
				feeds.push({ lp, gain });
			}
			outL = mixL;
			outR = mixR;
		}

		const out = node(ctx.createGain());
		let timer = 0;
		let speed = s.audio.spatial.rotateSpeed;
		if (shape.panners) {
			const pans = [-SURROUND_DEG, SURROUND_DEG].map((deg) => {
				const p = node(ctx.createPanner());
				p.panningModel = "HRTF";
				p.distanceModel = "linear";
				p.refDistance = 1;
				p.maxDistance = 10;
				p.rolloffFactor = 0;
				const pos = circlePosition(deg);
				p.positionX.value = pos.x;
				p.positionY.value = 0;
				p.positionZ.value = pos.z;
				p.connect(out);
				return p;
			});
			outL.connect(pans[0]);
			outR.connect(pans[1]);
			if (shape.rotate) {
				let angle = 0;
				const tick = () => {
					angle = (angle + 360 * speed * (ROTATE_TICK_MS / 1000)) % 360;
					[-SURROUND_DEG / 2, SURROUND_DEG / 2].forEach((offset, i) => {
						const pos = circlePosition(angle + offset);
						pans[i].positionX.setTargetAtTime(pos.x, ctx.currentTime, 0.03);
						pans[i].positionZ.setTargetAtTime(pos.z, ctx.currentTime, 0.03);
					});
				};
				timer = window.setInterval(tick, ROTATE_TICK_MS);
			}
		} else {
			const merge = node(ctx.createChannelMerger(2));
			outL.connect(merge, 0, 0);
			outR.connect(merge, 0, 1);
			merge.connect(out);
		}

		return {
			input: split,
			output: out,
			update(st) {
				const next = spatialShape(st);
				if (next.crossfeed !== shape.crossfeed || next.panners !== shape.panners || next.rotate !== shape.rotate) return false;
				setWidth(st);
				const p = crossfeedParams(st.audio.spatial.crossfeed);
				if (p)
					for (const f of feeds) {
						setParam(f.lp.frequency, p.cutoffHz, ctx);
						setParam(f.gain.gain, dbToGain(-p.feedDb), ctx);
					}
				speed = st.audio.spatial.rotateSpeed;
				return true;
			},
			dispose() {
				window.clearInterval(timer);
				for (const n of all) n.disconnect();
			},
		};
	},
};

// ---- karaoke (D6): lower the centre (vocal) band of the mid signal, keep bass, highs and the sides ----

const karaoke: StageDef = {
	id: "karaoke",
	wants: (s) => s.audio.karaoke.enabled && s.audio.karaoke.amount > 0,
	key: (s) => s.audio.karaoke,
	create(ctx, s) {
		const all: AudioNode[] = [];
		const gain = (v: number) => {
			const g = ctx.createGain();
			g.gain.value = v;
			all.push(g);
			return g;
		};
		const split = ctx.createChannelSplitter(2);
		const merge = ctx.createChannelMerger(2);
		all.push(split, merge);
		const mid = gain(1);
		const side = gain(1);
		const lMid = gain(0.5);
		const rMid = gain(0.5);
		const lSide = gain(0.5);
		const rSide = gain(-0.5);
		split.connect(lMid, 0);
		split.connect(lSide, 0);
		split.connect(rMid, 1);
		split.connect(rSide, 1);
		lMid.connect(mid);
		rMid.connect(mid);
		lSide.connect(side);
		rSide.connect(side);
		const hp = ctx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = 150;
		const lp = ctx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 6000;
		all.push(hp, lp);
		const cut = gain(-s.audio.karaoke.amount);
		const reduced = gain(1);
		mid.connect(reduced);
		mid.connect(hp);
		hp.connect(lp);
		lp.connect(cut);
		cut.connect(reduced);
		const sideNeg = gain(-1);
		const outL = gain(1);
		const outR = gain(1);
		reduced.connect(outL);
		reduced.connect(outR);
		side.connect(outL);
		side.connect(sideNeg);
		sideNeg.connect(outR);
		outL.connect(merge, 0, 0);
		outR.connect(merge, 0, 1);
		return {
			input: split,
			output: merge,
			update: (st) => setParam(cut.gain, -st.audio.karaoke.amount, ctx),
			dispose: () => {
				for (const n of all) n.disconnect();
			},
		};
	},
};

// ---- pitch (D6): delay-line granular pitch shifter (two modulated delays, cross-faded) ----

const PITCH_DELAY = 0.1;
const PITCH_FADE = 0.05;
const PITCH_BUFFER = 0.1;

function fadeBuffer(ctx: BaseAudioContext): AudioBuffer {
	const fs = ctx.sampleRate;
	const active = Math.round(PITCH_BUFFER * fs);
	const rest = Math.max(0, Math.round((PITCH_BUFFER - 2 * PITCH_FADE) * fs));
	const fade = Math.round(PITCH_FADE * fs);
	const buf = ctx.createBuffer(1, active + rest, fs);
	const p = buf.getChannelData(0);
	for (let i = 0; i < active; i++) {
		if (i < fade) p[i] = Math.sqrt(i / fade);
		else if (i >= active - fade) p[i] = Math.sqrt(1 - (i - (active - fade)) / fade);
		else p[i] = 1;
	}
	return buf;
}

function rampBuffer(ctx: BaseAudioContext, up: boolean): AudioBuffer {
	const fs = ctx.sampleRate;
	const active = Math.round(PITCH_BUFFER * fs);
	const rest = Math.max(0, Math.round((PITCH_BUFFER - 2 * PITCH_FADE) * fs));
	const length = active + rest;
	const buf = ctx.createBuffer(1, length, fs);
	const p = buf.getChannelData(0);
	for (let i = 0; i < active; i++) p[i] = up ? (active - i) / length : i / active;
	return buf;
}

const pitch: StageDef = {
	id: "pitch",
	wants: (s) => s.audio.pitch.semitones !== 0,
	key: (s) => s.audio.pitch,
	create(ctx, s) {
		const all: AudioNode[] = [];
		const inp = ctx.createGain();
		const out = ctx.createGain();
		all.push(inp, out);
		const down = rampBuffer(ctx, false);
		const up = rampBuffer(ctx, true);
		const fade = fadeBuffer(ctx);
		const sources: AudioBufferSourceNode[] = [];
		const src = (buffer: AudioBuffer) => {
			const n = ctx.createBufferSource();
			n.buffer = buffer;
			n.loop = true;
			sources.push(n);
			all.push(n);
			return n;
		};
		const g = (v = 1) => {
			const n = ctx.createGain();
			n.gain.value = v;
			all.push(n);
			return n;
		};
		const mod1 = src(down);
		const mod2 = src(down);
		const mod3 = src(up);
		const mod4 = src(up);
		const mod1Gain = g();
		const mod2Gain = g();
		const mod3Gain = g(0);
		const mod4Gain = g(0);
		mod1.connect(mod1Gain);
		mod2.connect(mod2Gain);
		mod3.connect(mod3Gain);
		mod4.connect(mod4Gain);
		const depth1 = g();
		const depth2 = g();
		mod1Gain.connect(depth1);
		mod3Gain.connect(depth1);
		mod2Gain.connect(depth2);
		mod4Gain.connect(depth2);
		const delay1 = ctx.createDelay(1);
		const delay2 = ctx.createDelay(1);
		all.push(delay1, delay2);
		depth1.connect(delay1.delayTime);
		depth2.connect(delay2.delayTime);
		const fade1 = src(fade);
		const fade2 = src(fade);
		const mix1 = g(0);
		const mix2 = g(0);
		fade1.connect(mix1.gain);
		fade2.connect(mix2.gain);
		inp.connect(delay1);
		inp.connect(delay2);
		delay1.connect(mix1);
		delay2.connect(mix2);
		mix1.connect(out);
		mix2.connect(out);
		const t = ctx.currentTime + 0.05;
		const t2 = t + PITCH_BUFFER - PITCH_FADE;
		mod1.start(t);
		mod2.start(t2);
		mod3.start(t);
		mod4.start(t2);
		fade1.start(t);
		fade2.start(t2);
		const apply = (semitones: number) => {
			const m = pitchMult(semitones);
			const upward = m > 0;
			for (const n of [mod1Gain, mod2Gain]) setParam(n.gain, upward ? 0 : 1, ctx);
			for (const n of [mod3Gain, mod4Gain]) setParam(n.gain, upward ? 1 : 0, ctx);
			for (const n of [depth1, depth2]) setParam(n.gain, 0.5 * PITCH_DELAY * Math.abs(m), ctx);
		};
		apply(s.audio.pitch.semitones);
		return {
			input: inp,
			output: out,
			update: (st) => apply(st.audio.pitch.semitones),
			dispose() {
				for (const n of sources) n.stop();
				for (const n of all) n.disconnect();
			},
		};
	},
};

// ---- dynamics (D4): compressor presets with make-up gain ----

const dynamics: StageDef = {
	id: "dynamics",
	wants: (s) => s.audio.dynamics.compressor !== "off",
	key: (s) => s.audio.dynamics.compressor,
	create(ctx, s) {
		const comp = ctx.createDynamicsCompressor();
		const makeup = ctx.createGain();
		comp.connect(makeup);
		const apply = (st: EngineState) => {
			const p = compressorParams(st.audio.dynamics.compressor);
			if (!p) return;
			comp.threshold.value = p.threshold;
			comp.knee.value = p.knee;
			comp.ratio.value = p.ratio;
			comp.attack.value = p.attack;
			comp.release.value = p.release;
			setParam(makeup.gain, dbToGain(p.makeupDb), ctx);
		};
		apply(s);
		return {
			input: comp,
			output: makeup,
			update: apply,
			dispose() {
				comp.disconnect();
				makeup.disconnect();
			},
		};
	},
};

// ---- fade (D5): one gain the transitions and the sleep timer ramp ----

export type FadeInstance = StageInstance & {
	/** Ramps the gain to `value` over `seconds` (linear). */
	fadeTo(value: number, seconds: number): void;
	/** Jumps to `value` (used when a new track starts silent). */
	set(value: number): void;
};

const fade: StageDef = {
	id: "fade",
	wants: (s) => s.audio.transitions.crossfade > 0 || s.runtime.fadeWanted,
	key: (s) => [s.audio.transitions.crossfade, s.runtime.fadeWanted],
	create(ctx) {
		const gain = ctx.createGain();
		const inst: FadeInstance = {
			input: gain,
			output: gain,
			update: () => undefined,
			dispose: () => gain.disconnect(),
			fadeTo(value, seconds) {
				const now = ctx.currentTime;
				gain.gain.cancelScheduledValues(now);
				gain.gain.setValueAtTime(gain.gain.value, now);
				gain.gain.linearRampToValueAtTime(value, now + Math.max(0.01, seconds));
			},
			set(value) {
				gain.gain.cancelScheduledValues(ctx.currentTime);
				gain.gain.setValueAtTime(value, ctx.currentTime);
			},
		};
		return inst;
	},
};

// ---- analyser (D5 silence detection, D7 visualizer, tests) ----

export type AnalyserInstance = StageInstance & { analyser: AnalyserNode };

const analyser: StageDef = {
	id: "analyser",
	wants: (s) => s.runtime.analyserWanted || s.audio.visualizer.enabled || s.audio.transitions.skipSilence,
	key: () => null,
	create(ctx) {
		const node = ctx.createAnalyser();
		node.fftSize = 2048;
		node.smoothingTimeConstant = 0.6;
		const inst: AnalyserInstance = { input: node, output: node, analyser: node, update: () => undefined, dispose: () => node.disconnect() };
		return inst;
	},
};

export const STAGES: StageDef[] = [input, eq, spatial, karaoke, pitch, dynamics, fade, analyser];
