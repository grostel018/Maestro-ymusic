// Baseline performance scenarios. Run with `pnpm test:perf`; budgets are checked in a later task,
// so only p7 (background playback) has a hard rule.
import { normalizeAudio } from "../../../src/shared/audio/settings.ts";
import type { Scenario, TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play, recordGpu, recordPerf, round, sampleCpu, sampleFrames, summarizeFrames } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

const WIN = "__YTMD_TEST__.getMainWindow().main";
const YT = "__YTMD_TEST__.getMainWindow().views.youtubeView";
const evalWin = <T>(t: TestApp, code: string) => t.mainEval<T>(`(() => { const win = ${WIN}; ${code} })()`);

async function prepare(t: TestApp, width = 1500, height = 800) {
	await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
	await recordGpu(t);
	await evalWin(t, `if (win.isMaximized()) win.unmaximize(); win.setSize(${width}, ${height}); win.center();`);
	await sleep(1500);
}

async function frameRun(id: string, t: TestApp) {
	const yt = await t.view("youtube");
	const deltas = await sampleFrames(yt, 10000);
	const raw = summarizeFrames(deltas);
	const summary = { p50: round(raw.p50), p95: round(raw.p95), max: round(raw.max), droppedPct: round(raw.droppedPct) };
	recordPerf(id, { ...summary, frames: deltas.length });
	console.log(`  ${id}: ${JSON.stringify(summary)} frames=${deltas.length}`);
}

/**
 * Media time played over `ms`, sampled each second. The track and any ad share one `<video>`, and the
 * next track starts from 0, so a backwards jump counts the new media's time instead of a negative step.
 * A step above 3 s (a seek) counts as 1 s. A stalled or paused player adds nothing.
 */
async function playedSeconds(yt: CdpSession, ms: number) {
	const read = () =>
		yt.eval<{ ct: number; ad: boolean }>(
			"({ ct: document.querySelector('video')?.currentTime ?? 0, ad: !!document.querySelector('#movie_player')?.classList.contains('ad-showing') })",
		);
	const t0 = Date.now();
	let prev = await read();
	let advancedS = 0;
	let adS = 0;
	let resets = 0;
	while (Date.now() - t0 < ms) {
		await sleep(1000);
		const cur = await read();
		let step = cur.ct >= prev.ct ? cur.ct - prev.ct : cur.ct;
		if (cur.ct < prev.ct) resets++;
		if (step > 3) step = 1;
		advancedS += step;
		if (cur.ad) adS += step;
		prev = cur;
	}
	return { advancedS, adS, resets, wallS: (Date.now() - t0) / 1000 };
}

/** Time and renderer frames until the YouTube view's bounds follow the window's content width after `change`. */
async function convergence(t: TestApp, yt: CdpSession, change: string) {
	await yt.eval(
		"(() => { window.__perfStamps = []; const tick = () => { if (window.__perfStamps) { window.__perfStamps.push(Date.now()); requestAnimationFrame(tick); } }; requestAnimationFrame(tick); })()",
	);
	const r = await t.mainEval<{ start: number; end: number; converged: boolean }>(`(async () => {
		const win = ${WIN}; const view = ${YT};
		const start = Date.now();
		${change}
		const match = () => view.getBounds().width === win.getContentSize()[0];
		while (!match() && Date.now() - start < 3000) await new Promise((r) => setTimeout(r, 1));
		return { start, end: Date.now(), converged: match() };
	})()`);
	await sleep(300);
	const stamps = await yt.eval<number[]>("(() => { const s = window.__perfStamps; window.__perfStamps = null; return s; })()");
	return { ms: r.end - r.start, frames: stamps.filter((s) => s > r.start && s <= r.end + 16).length, converged: r.converged };
}

export const scenarios: Scenario[] = [
	{
		id: "p1",
		title: "Home idle CPU, 10 s",
		run: async (t) => {
			await prepare(t);
			await sleep(3000);
			const cpu = await sampleCpu(t, 10000);
			recordPerf("p1", cpu);
			console.log(`  p1: ${JSON.stringify(cpu)}`);
		},
	},
	{
		id: "p2",
		title: "Playing, frames 10 s at 1500x800",
		run: async (t) => {
			await prepare(t);
			await play(t);
			await frameRun("p2", t);
		},
	},
	{
		id: "p3",
		title: "Playing, frames 10 s maximized",
		run: async (t) => {
			await prepare(t);
			await play(t);
			await evalWin(t, "win.maximize();");
			await sleep(1500);
			await frameRun("p3", t);
		},
	},
	{
		id: "p3b",
		title: "Playing, frames 10 s in HTML fullscreen",
		run: async (t) => {
			await prepare(t);
			await play(t);
			const yt = await t.view("youtube");
			await yt.eval("document.querySelector('video').requestFullscreen()", { userGesture: true });
			await waitFor(async () => (await yt.eval<boolean>("!!document.fullscreenElement")) || false, 10000, "HTML fullscreen");
			await sleep(1500);
			await frameRun("p3b", t);
			await yt.eval("document.exitFullscreen()").catch(() => undefined);
		},
	},
	{
		id: "p4",
		title: "Resize sweep 1000 to 1600, view follows window",
		run: async (t) => {
			await prepare(t, 1000, 800);
			const yt = await t.view("youtube");
			const steps: Array<{ width: number; ms: number; frames: number; converged: boolean }> = [];
			for (let i = 0; i < 20; i++) {
				const width = 1000 + Math.round((i * 600) / 19);
				steps.push({ width, ...(await convergence(t, yt, `win.setSize(${width}, 800);`)) });
				await sleep(200);
			}
			const frames = steps.map((s) => s.frames);
			const ms = steps.map((s) => s.ms);
			const summary = {
				notConverged: steps.filter((s) => !s.converged).length,
				maxFrames: Math.max(...frames),
				avgFrames: round(frames.reduce((a, b) => a + b, 0) / frames.length),
				maxMs: Math.max(...ms),
				avgMs: round(ms.reduce((a, b) => a + b, 0) / ms.length),
			};
			recordPerf("p4", { ...summary, steps });
			console.log(`  p4: ${JSON.stringify(summary)}`);
		},
	},
	{
		id: "p5",
		title: "View follows window after entering and leaving fullscreen",
		run: async (t) => {
			await prepare(t);
			const yt = await t.view("youtube");
			const enter = await convergence(t, yt, "win.setFullScreen(true);");
			await sleep(1500);
			const leave = await convergence(t, yt, "win.setFullScreen(false);");
			recordPerf("p5", { enter, leave });
			console.log(`  p5: enter=${JSON.stringify(enter)} leave=${JSON.stringify(leave)}`);
		},
	},
	{
		id: "p6",
		title: "Paused and minimized, CPU 60 s",
		run: async (t) => {
			await prepare(t);
			await play(t);
			const yt = await t.view("youtube");
			await yt.eval("document.querySelector('#movie_player').pauseVideo()", { userGesture: true });
			await sleep(1000);
			await evalWin(t, "win.minimize();");
			await sleep(3000);
			const cpu = await sampleCpu(t, 60000);
			recordPerf("p6", cpu);
			console.log(`  p6: ${JSON.stringify(cpu)}`);
		},
	},
	{
		id: "p7",
		title: "Minimized playback advances at least 100 s in 120 s",
		run: async (t) => {
			await prepare(t);
			await play(t);
			const yt = await t.view("youtube");
			await evalWin(t, "win.minimize();");
			const r = await playedSeconds(yt, 120000);
			const advanced = round(r.advancedS);
			const wallS = round(r.wallS);
			recordPerf("p7", { advancedS: advanced, wallS, adS: round(r.adS), resets: r.resets, required: 100, pass: advanced >= 100 });
			console.log(`  p7: advanced ${advanced}s in ${wallS}s (ads ${round(r.adS)}s, media changes ${r.resets})`);
			if (advanced < 100) throw new Error(`playback advanced only ${advanced} s in ${wallS} s while minimized (need >= 100)`);
		},
	},
	{
		id: "p9",
		title: "Playing, CPU 15 s in Video mode, then 15 s in Song mode",
		launch: { settings: { player: { videoMode: "video" } } },
		run: async (t) => {
			await prepare(t);
			await play(t);
			const yt = await t.view("youtube");
			await sleep(2000);
			const video = await sampleCpu(t, 15000);
			await yt.eval(`(document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true })), true)`);
			await waitFor(async () => (await t.mainEval<string>(`__YTMD_TEST__.services.getProvider("settings").get("player.videoMode")`)) === "audio", 10000, "Song mode");
			// Song mode may swap to the song's own stream; let it load before sampling.
			await sleep(5000);
			const audio = await sampleCpu(t, 15000);
			const playing = await yt.eval<boolean>("!document.querySelector('video')?.paused");
			recordPerf("p9", { videoAvgPct: video.avgPct, audioAvgPct: audio.avgPct, video: video.byType, audio: audio.byType, playing });
			console.log(`  p9: video ${video.avgPct}% audio ${audio.avgPct}% playing=${playing}`);
			if (!playing) throw new Error("playback stopped after switching to Song mode");
		},
	},
	{
		id: "p10",
		title: "Playing with the audio lab on (equalizer, compressor, visualizer drawing), frames and CPU 10 s",
		launch: {
			settings: {
				audio: { ...normalizeAudio(undefined), eq: { ...normalizeAudio(undefined).eq, enabled: true, bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] }, dynamics: { normalize: false, compressor: "gentle" }, visualizer: { enabled: true, style: "bars" } },
			},
		},
		run: async (t) => {
			await prepare(t);
			await play(t);
			const yt = await t.view("youtube");
			const open = `document.querySelector("ytmusic-app-layout")?.hasAttribute("player-page-open")`;
			await waitFor(
				async () => {
					if (!(await yt.eval<boolean>(open))) await yt.eval(`(document.querySelector("ytmusic-player-bar .middle-controls")?.click(), true)`, { userGesture: true });
					return yt.eval<boolean>(open);
				},
				15000,
				"the player page",
			);
			await waitFor(async () => (await yt.eval<string>(`window.__ytmdAudio?.info().chain.join() ?? ""`)) === "eq,dynamics,analyser", 15000, "the audio chain");
			await waitFor(async () => (await yt.eval<boolean>(`!!document.getElementById("ytmd-visualizer")?.width`)) || false, 10000, "the visualizer canvas");
			await sleep(1500);
			const cpu = await sampleCpu(t, 10000);
			await frameRun("p10", t);
			console.log(`  p10 cpu: ${JSON.stringify(cpu)}`);
			recordPerf("p10-cpu", cpu);
		},
	},
];
