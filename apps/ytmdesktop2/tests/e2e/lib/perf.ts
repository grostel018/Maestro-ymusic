import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gpuInfo, type TestApp, TRACK_URL } from "./app.ts";
import type { CdpSession } from "./cdp.ts";
import { summarizeFrames } from "./stats.ts";
import { sleep, waitFor } from "./wait.ts";

export { summarizeFrames };

const RESULTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "results");
export const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
export const perfFile = path.join(RESULTS, `perf-${runStamp}.json`);

type PerfFile = { runStamp: string; gpu?: unknown; results: Record<string, unknown> };

function readFile(): PerfFile {
	return fs.existsSync(perfFile) ? (JSON.parse(fs.readFileSync(perfFile, "utf8")) as PerfFile) : { runStamp, results: {} };
}

function writeFile(f: PerfFile) {
	fs.mkdirSync(RESULTS, { recursive: true });
	fs.writeFileSync(perfFile, `${JSON.stringify(f, null, 2)}\n`);
}

/** Appends one scenario's numbers to this run's `perf-<runStamp>.json`. */
export function recordPerf(id: string, data: object): void {
	const f = readFile();
	f.results[id] = data;
	writeFile(f);
}

/** Stores, once per run, whether Chromium renders in hardware: `app.getGPUFeatureStatus()` plus the GPU device list. */
export async function recordGpu(t: TestApp): Promise<void> {
	const f = readFile();
	if (f.gpu) return;
	const featureStatus = await t.mainEval<unknown>("process.mainModule.require('electron').app.getGPUFeatureStatus()");
	const devices = await gpuInfo().catch((e: Error) => `unknown (${e.message})`);
	f.gpu = { featureStatus, devices };
	writeFile(f);
}

/** Frame deltas (ms) of `requestAnimationFrame` in the view over `ms`. Zero frames when the view is hidden. */
export async function sampleFrames(view: CdpSession, ms: number): Promise<number[]> {
	await view.eval(`(() => {
		window.__perfFrames = [];
		let last = performance.now();
		const tick = (now) => {
			if (window.__perfFrames) { window.__perfFrames.push(now - last); last = now; requestAnimationFrame(tick); }
		};
		requestAnimationFrame(tick);
	})()`);
	await sleep(ms);
	return await view.eval<number[]>("(() => { const f = window.__perfFrames; window.__perfFrames = null; return f.slice(1); })()");
}

export const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

/** App CPU over `ms`: `app.getAppMetrics()` `percentCPUUsage` every 1000 ms, summed over processes, plus the sum per process type. */
export async function sampleCpu(t: TestApp, ms: number): Promise<{ avgPct: number; byType: Record<string, number> }> {
	const read = () =>
		t.mainEval<Array<{ type: string; cpu: { percentCPUUsage: number } }>>(
			"process.mainModule.require('electron').app.getAppMetrics().map((m) => ({ type: m.type, cpu: { percentCPUUsage: m.cpu.percentCPUUsage } }))",
		);
	await read(); // the first reading has no baseline interval
	const n = Math.max(1, Math.floor(ms / 1000));
	let total = 0;
	const byType: Record<string, number> = {};
	for (let i = 0; i < n; i++) {
		await sleep(1000);
		const metrics = await read();
		total += metrics.reduce((s, m) => s + m.cpu.percentCPUUsage, 0);
		for (const m of metrics) byType[m.type] = (byType[m.type] ?? 0) + m.cpu.percentCPUUsage;
	}
	for (const k of Object.keys(byType)) byType[k] = round(byType[k] / n);
	return { avgPct: round(total / n), byType };
}

/** Opens `TRACK_URL` in the YouTube view and starts playback until `currentTime > 1`. */
export async function play(t: TestApp): Promise<void> {
	const yt = await t.view("youtube");
	await yt.eval(`location.href = ${JSON.stringify(TRACK_URL)}`);
	await sleep(2000);
	await waitFor(async () => (await yt.eval<boolean>("!!document.querySelector('#movie_player')?.playVideo")) || false, 60000, "the YouTube Music player");
	await waitFor(
		async () => {
			await yt.eval("document.querySelector('#movie_player').playVideo()", { userGesture: true });
			return (await yt.eval<number>("document.querySelector('video')?.currentTime ?? 0")) > 1 || false;
		},
		60000,
		"playback to pass 1 s",
	);
}
