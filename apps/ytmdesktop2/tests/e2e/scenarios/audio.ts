// Phase D: the audio engine and audio lab (equalizer, spatial, dynamics, karaoke, pitch, transitions, visualizer).
import fs from "node:fs";
import path from "node:path";
import { type AudioSettings, normalizeAudio } from "../../../src/shared/audio/settings.ts";
import { launchApp, type Scenario, type TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";
import { startMockServer } from "../mocks/server.ts";

type Graph = { attached: boolean; running: boolean; chain: string[]; failed: string[] };
type Media = { t: number; paused: boolean; duration: number; id: string };

/** A complete `audio` section (seeded sections replace the defaults whole). */
const audio = (patch: (a: AudioSettings) => void = () => undefined): AudioSettings => {
	const a = normalizeAudio(undefined);
	patch(a);
	return a;
};
const BASS_BOOST = [6, 5, 4, 2, 0, 0, 0, 0, 0, 0];

const graph = (yt: CdpSession) => yt.eval<Graph>("window.__ytmdAudio.info()");
const media = (yt: CdpSession) =>
	yt.eval<Media>(
		`(() => { const v = document.querySelector("video"); return { t: v.currentTime, paused: v.paused, duration: v.duration, id: document.querySelector("#movie_player").getVideoData?.().video_id ?? "" }; })()`,
	);
const setAudio = (t: TestApp, value: AudioSettings) => t.mainEval(`(__YTMD_TEST__.services.getProvider("settings").set("audio", ${JSON.stringify(value)}), true)`);
const savedAudio = (t: TestApp) => t.mainEval<AudioSettings>(`__YTMD_TEST__.services.getProvider("settings").get("audio")`);
const untilChain = (yt: CdpSession, test: (g: Graph) => boolean, what: string, ms = 10000) =>
	waitFor(async () => {
		const g = await graph(yt);
		return test(g) ? g : false;
	}, ms, what);
const sameChain = (want: string[]) => (g: Graph) => g.attached && g.chain.join() === want.join();

/** Mean of `n` band readings `everyMs` apart (music varies; one reading is noise). */
async function bandDb(yt: CdpSession, fromHz: number, toHz: number, n = 20, everyMs = 100): Promise<number> {
	let sum = 0;
	for (let i = 0; i < n; i++) {
		sum += await yt.eval<number>(`window.__ytmdAudio.band(${fromHz}, ${toHz}) ?? -200`);
		await sleep(everyMs);
	}
	return sum / n;
}

/** Fails unless playback advanced by at least `minS` over `ms`. */
async function keepsPlaying(yt: CdpSession, ms: number, minS: number, what: string) {
	const a = await media(yt);
	await sleep(ms);
	const b = await media(yt);
	if (b.paused || b.t - a.t < minS) throw new Error(`playback stalled ${what}: ${a.t.toFixed(2)} -> ${b.t.toFixed(2)} (paused ${b.paused})`);
}

export const scenarios: Scenario[] = [
	{
		id: "s26",
		smoke: true,
		title: "Audio engine: stages attach in the fixed order, toggling three on and all off never stalls or leaves a silence over 200 ms, and with all off the source plays straight out",
		launch: { settings: { audio: audio((a) => ((a.eq.enabled = true), (a.eq.bands = [...BASS_BOOST]), (a.dynamics.compressor = "gentle"))) } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await untilChain(yt, sameChain(["eq", "dynamics"]), "the engine to run eq then dynamics");
			await keepsPlaying(yt, 2000, 1.5, "with eq and compressor on");
			await yt.eval("(window.__ytmdAudio.setAnalyser(true), true)");
			await untilChain(yt, (g) => g.chain.includes("analyser"), "the analyser tap");
			// Silence watch in the page: the longest run of samples under -70 dBFS while stages come and go.
			await yt.eval(`(() => {
				const w = { start: 0, longest: 0, samples: 0 };
				window.__gapWatch = w;
				w.timer = setInterval(() => {
					const l = window.__ytmdAudio.level() ?? -200; const now = performance.now(); w.samples++;
					if (l < -70) { if (!w.start) w.start = now; w.longest = Math.max(w.longest, now - w.start); } else w.start = 0;
				}, 10);
				return true;
			})()`);
			await setAudio(
				t,
				audio((a) => {
					a.spatial.width = 150;
					a.karaoke.enabled = true;
					a.dynamics.compressor = "night";
				}),
			);
			await untilChain(yt, sameChain(["spatial", "karaoke", "dynamics", "analyser"]), "three stages on");
			await sleep(1500);
			await setAudio(t, audio());
			await untilChain(yt, sameChain(["analyser"]), "every stage off but the analyser");
			await sleep(1500);
			const gap = await yt.eval<{ longest: number; samples: number }>("(() => { clearInterval(window.__gapWatch.timer); return window.__gapWatch; })()");
			console.log(`  s26: longest silence ${Math.round(gap.longest)} ms over ${gap.samples} samples`);
			if (gap.samples < 100) throw new Error(`the silence watch took only ${gap.samples} samples`);
			if (gap.longest > 200) throw new Error(`a silence of ${Math.round(gap.longest)} ms while switching stages (limit 200 ms)`);
			await yt.eval("(window.__ytmdAudio.setAnalyser(false), true)");
			const g = await untilChain(yt, sameChain([]), "no stage at all");
			if (!g.attached) throw new Error("the engine should stay attached (source to output) once it was used");
			await keepsPlaying(yt, 2000, 1.5, "with every stage off");
		},
	},
	{
		id: "s27",
		title: "Equalizer: Bass Boost raises the low band against the mids at the analyser, and the A/B switch (off) takes it back out",
		launch: { settings: { audio: audio() } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await yt.eval("(window.__ytmdAudio.setAnalyser(true), true)");
			await untilChain(yt, sameChain(["analyser"]), "the analyser tap");
			await sleep(1000);
			const tilt = async () => (await bandDb(yt, 40, 120)) - (await bandDb(yt, 1000, 3000));
			const flat = await tilt();
			await setAudio(t, audio((a) => ((a.eq.enabled = true), (a.eq.bands = [...BASS_BOOST]), (a.eq.preset = "bass-boost"))));
			await untilChain(yt, sameChain(["eq", "analyser"]), "the equalizer stage");
			await sleep(500);
			const boosted = await tilt();
			await setAudio(t, audio((a) => ((a.eq.enabled = false), (a.eq.bands = [...BASS_BOOST]))));
			await untilChain(yt, sameChain(["analyser"]), "the equalizer to leave the chain");
			console.log(`  s27: low-minus-mid ${flat.toFixed(1)} dB flat, ${boosted.toFixed(1)} dB with Bass Boost`);
			if (boosted - flat < 2.5) throw new Error(`Bass Boost moved the low band only ${(boosted - flat).toFixed(1)} dB against the mids (need >= 2.5)`);
			await keepsPlaying(yt, 1500, 1, "after the A/B switch");
		},
	},
	{
		id: "s27b",
		title: "AutoEq: a headphone search and profile load go through main, parse the ParametricEQ file, and the second load comes from the offline cache",
		run: async (t) => {
			const mock = await startMockServer();
			mock.on("GET", "/results/INDEX.md", () => ({
				text: "# Index\n- [Sennheiser HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600) by oratory1990\n- [Sony WH-1000XM4](./rtings/over-ear/Sony%20WH-1000XM4) by rtings\n",
			}));
			mock.on("GET", "/results/oratory1990/over-ear/Sennheiser%20HD%20600/Sennheiser%20HD%20600%20ParametricEQ.txt", () => ({
				text: "Preamp: -6.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain 5.8 dB Q 0.70\nFilter 2: ON PK Fc 3036 Hz Gain 3.7 dB Q 2.32\n",
			}));
			await t.close();
			const app = await launchApp({ env: { YTMD_E2E_API_AUTOEQ: mock.url } });
			try {
				await waitFor(async () => (await app.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.services")) || false, 60000, "the test hooks");
				const found = await app.mainEval<Array<{ name: string; source: string; path: string }>>(`__YTMD_TEST__.services.getProvider("audio").autoeqSearch("hd 600")`);
				if (found.length !== 1 || found[0].name !== "Sennheiser HD 600") throw new Error(`search returned ${JSON.stringify(found)}`);
				const load = () =>
					app.mainEval<{ name: string; preamp: number; filters: Array<{ type: string }> }>(`__YTMD_TEST__.services.getProvider("audio").autoeqLoad(${JSON.stringify(found[0])})`);
				const profile = await load();
				if (profile.preamp !== -6.3 || profile.filters.map((f) => f.type).join() !== "lowshelf,peaking") throw new Error(`profile parsed as ${JSON.stringify(profile)}`);
				const fetched = mock.requests.length;
				await load();
				if (mock.requests.length !== fetched) throw new Error("the second load fetched again instead of using the cache");
				const dir = await app.mainEval<string>(`require("node:path").join(process.mainModule.require("electron").app.getPath("userData"), "autoeq")`);
				if (!fs.existsSync(path.join(dir, "INDEX.md"))) throw new Error(`no cached INDEX.md in ${dir}`);
			} finally {
				await app.close();
				await mock.close();
			}
		},
	},
	{
		id: "s28",
		title: "Spatial, dynamics, vocal reduction and pitch each join the chain and keep the sound going; vocal reduction lowers the mids; the wheel moves the volume by 1",
		launch: { settings: { audio: audio() } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await yt.eval("(window.__ytmdAudio.setAnalyser(true), true)");
			await untilChain(yt, sameChain(["analyser"]), "the analyser tap");
			const steps: Array<[string, string, (a: AudioSettings) => void]> = [
				["crossfeed", "spatial", (a) => (a.spatial.crossfeed = "medium")],
				["width", "spatial", (a) => (a.spatial.width = 160)],
				["surround", "spatial", (a) => (a.spatial.surround = true)],
				["8D", "spatial", (a) => (a.spatial.rotate = true)],
				["normalize", "input", (a) => (a.dynamics.normalize = true)],
				["compressor", "dynamics", (a) => (a.dynamics.compressor = "night")],
				["pitch", "pitch", (a) => (a.pitch.semitones = 3)],
				["karaoke", "karaoke", (a) => (a.karaoke.enabled = true)],
			];
			for (const [name, stage, patch] of steps) {
				await setAudio(t, audio(patch));
				await untilChain(yt, (g) => g.chain.includes(stage), `${name} to add the ${stage} stage`);
				await sleep(800);
				const level = await yt.eval<number>("window.__ytmdAudio.level() ?? -200");
				if (level < -60) throw new Error(`${name}: the output went silent (${level.toFixed(1)} dBFS)`);
				await keepsPlaying(yt, 1000, 0.6, `with ${name} on`);
			}
			await setAudio(t, audio());
			await untilChain(yt, sameChain(["analyser"]), "every effect off");
			await sleep(500);
			const plain = await bandDb(yt, 300, 3000);
			await setAudio(t, audio((a) => ((a.karaoke.enabled = true), (a.karaoke.amount = 1))));
			await untilChain(yt, sameChain(["karaoke", "analyser"]), "vocal reduction at full");
			await sleep(500);
			const reduced = await bandDb(yt, 300, 3000);
			console.log(`  s28: 300 Hz-3 kHz ${plain.toFixed(1)} dB plain, ${reduced.toFixed(1)} dB with vocal reduction`);
			if (plain - reduced < 1.5) throw new Error(`vocal reduction lowered the mids by only ${(plain - reduced).toFixed(1)} dB (need >= 1.5)`);

			const volume = () => yt.eval<number>(`Math.round(document.querySelector("#movie_player").getVolume())`);
			await yt.eval(`(document.querySelector("#movie_player").setVolume(50), true)`);
			await sleep(300);
			const before = await volume();
			await waitFor(
				async () =>
					yt.eval<boolean>(
						`(() => { const bar = document.querySelector("ytmusic-player-bar, ytmusic-miniplayer"); return !!bar && bar.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })) === false; })()`,
					),
				10000,
				"the player bar to take the wheel",
			)
			await waitFor(async () => ((await volume()) === before + 1 ? true : false), 3000, `the wheel to raise the volume from ${before} to ${before + 1}`);
			if (!(await yt.eval<boolean>(`!!document.getElementById("ytmd-volume-hud")?.textContent.includes("%")`))) throw new Error("no volume readout after the wheel");
			// Our player-bar buttons mount in every layout YTM serves (classic bar or ytmusic-miniplayer).
			await waitFor(
				async () => (await yt.eval<boolean>(`["ytmd-av-bar-button", "ytmd-speed-button", "ytmd-output-button", "ytmd-sleep-button"].every((id) => document.getElementById(id))`)) || false,
				10000,
				"the Song/Video, speed, output and sleep buttons in the player bar",
			);
		},
	},
	{
		id: "s29",
		title: "Transitions: with a 4 s crossfade the track fades into the next one without a stall; the sleep timer fades and then pauses",
		launch: { settings: { audio: audio((a) => (a.transitions.crossfade = 4)) } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await untilChain(yt, sameChain(["fade"]), "the fade stage");
			const first = await media(yt);
			if (!Number.isFinite(first.duration) || first.duration < 30) throw new Error(`unexpected test track length ${first.duration}`);
			await yt.eval(`(document.querySelector("video").currentTime = document.querySelector("video").duration - 7, true)`);
			const next = await waitFor(
				async () => {
					const m = await media(yt);
					return m.id && m.id !== first.id && m.t > 1 && !m.paused ? m : false;
				},
				30000,
				"the next track to start playing after the crossfade",
			);
			await keepsPlaying(yt, 2000, 1.5, `on the next track ${next.id}`);
			await yt.eval("(window.__ytmdAudio.setAnalyser(true), true)");
			await sleep(1500);
			const level = await yt.eval<number>("window.__ytmdAudio.level() ?? -200");
			if (level < -60) throw new Error(`the next track did not fade back in (${level.toFixed(1)} dBFS)`);

			await yt.eval("(window.__ytmdSleep.set(12000), true)");
			await waitFor(async () => (await yt.eval<boolean>("window.__ytmdSleep.state().fading")) || false, 8000, "the sleep timer to start fading");
			await waitFor(async () => (await media(yt)).paused || false, 15000, "the sleep timer to pause");
			const state = await yt.eval<{ kind: string }>("window.__ytmdSleep.state()");
			if (state.kind !== "off") throw new Error(`the sleep timer should reset after pausing, is ${state.kind}`);
		},
	},
	{
		id: "s30",
		title: "Audio settings page shows the live chain and saves a change; the visualizer draws over the open player and goes away when switched off",
		launch: { settings: { audio: audio((a) => ((a.dynamics.compressor = "gentle"), (a.visualizer.enabled = true))) } },
		run: async (t) => {
			await play(t);
			const yt = await t.view("youtube");
			await untilChain(yt, (g) => g.chain.includes("dynamics") && g.chain.includes("analyser"), "the compressor and the visualizer's analyser");
			await waitFor(
				async () => {
					if (!(await yt.eval<boolean>(`document.querySelector("ytmusic-app-layout").hasAttribute("player-page-open")`)))
						await yt.eval(`(document.querySelector("ytmusic-player-bar .middle-controls .title, ytmusic-player-bar .middle-controls")?.click(), true)`, { userGesture: true });
					return yt.eval<boolean>(`document.querySelector("ytmusic-app-layout").hasAttribute("player-page-open")`);
				},
				15000,
				"the player page to open",
			);
			await waitFor(
				async () =>
					(await yt.eval<boolean>(`(() => { const c = document.getElementById("ytmd-visualizer"); if (!c || !c.width) return false;
						const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; })()`)) || false,
				10000,
				"the visualizer to draw on the player",
			);

			await t.mainEval("__YTMD_TEST__.services.getProvider('app').openSettingsWindow().then(() => true)");
			const page = await t.view(/#\/(?!youtube)/);
			await page.eval("location.hash = '#/player/audio'");
			await waitFor(
				async () => (await page.eval<string>(`document.querySelector('[data-testid="audio-chain"]')?.innerText ?? ""`)).includes("Compressor") || false,
				15000,
				"the chain view to list the compressor",
			);
			const clicked = await page.eval<boolean>(
				`(() => { const b = [...document.querySelectorAll('[role="radiogroup"][aria-label="Compressor"] [role="radio"]')].find((e) => e.textContent.trim() === "Night"); b?.click(); return !!b; })()`,
			);
			if (!clicked) throw new Error("no Night option in the compressor control");
			await waitFor(async () => ((await savedAudio(t)).dynamics.compressor === "night" ? true : false), 5000, "audio.dynamics.compressor to be saved as night");

			await setAudio(t, audio((a) => (a.dynamics.compressor = "night")));
			await waitFor(async () => (await yt.eval<boolean>(`!document.getElementById("ytmd-visualizer")`)) || false, 5000, "the visualizer to go away when switched off");
			await keepsPlaying(yt, 1500, 1, "after the settings changes");
		},
	},
];
