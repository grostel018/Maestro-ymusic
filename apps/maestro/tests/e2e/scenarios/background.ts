// Background / power: hidden app views rest, the YouTube view keeps playing, the power hold follows playback.
import type { Scenario, TestApp } from "../lib/app.ts";
import { play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

const WIN = "__YTMD_TEST__.getMainWindow().main";
const HELD = "__YTMD_TEST__.services.getProvider('startup').isPowerHeld()";
const CURRENT_TIME = "document.querySelector('video')?.currentTime ?? 0";

/**
 * Task 7 Step 3b kept these process-wide (removing them saved no measurable CPU), so s11 expects them on.
 * Flip an entry here if a later measurement removes one.
 */
const BACKGROUNDING_SWITCHES: Record<string, boolean> = {
	"disable-renderer-backgrounding": true,
	"disable-background-timer-throttling": true,
	"disable-backgrounding-occluded-windows": true,
};

async function ready(t: TestApp) {
	await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
}

export const scenarios: Scenario[] = [
	{
		id: "s9",
		smoke: true,
		reuse: true,
		title: "Minimized: the toolbar view is hidden and YouTube keeps playing",
		run: async (t) => {
			await ready(t);
			await play(t);
			const yt = await t.view("youtube");
			const toolbar = await t.view("toolbar");
			const before = await yt.eval<number>(CURRENT_TIME);
			await t.mainEval(`${WIN}.minimize()`);
			await sleep(5000);
			const visibility = await toolbar.eval<string>("document.visibilityState");
			const advanced = (await yt.eval<number>(CURRENT_TIME)) - before;
			console.log(`  s9: toolbar ${visibility}, playback advanced ${advanced.toFixed(2)} s in 5 s`);
			if (visibility !== "hidden") throw new Error(`toolbar view visibilityState is "${visibility}" while minimized (expected "hidden")`);
			if (advanced < 4) throw new Error(`playback advanced only ${advanced.toFixed(2)} s in 5 s while minimized (need >= 4)`);
		},
	},
	{
		id: "s10",
		reuse: true,
		title: "The power hold is taken while playing and released after pause",
		run: async (t) => {
			await ready(t);
			await play(t);
			await waitFor(async () => (await t.mainEval<boolean>(HELD)) || false, 5000, "the power hold while playing");
			const yt = await t.view("youtube");
			await yt.eval("document.querySelector('#movie_player').pauseVideo()", { userGesture: true });
			await sleep(1000);
			if (await t.mainEval<boolean>(HELD)) throw new Error("the power hold is still held 1 s after pause");
		},
	},
	{
		id: "s11",
		reuse: true,
		title: "The GPU blocklist is respected and the backgrounding switches match the Step 3b decision",
		run: async (t) => {
			await ready(t);
			const has = (name: string) => t.mainEval<boolean>(`process.mainModule.require('electron').app.commandLine.hasSwitch(${JSON.stringify(name)})`);
			if (await has("ignore-gpu-blocklist")) throw new Error("ignore-gpu-blocklist is set although app.forceGpu is off");
			if (await has("in-progress-gpu")) throw new Error("the misspelled in-progress-gpu switch is still set");
			for (const [name, expected] of Object.entries(BACKGROUNDING_SWITCHES)) {
				if ((await has(name)) !== expected) throw new Error(`${name} is ${expected ? "missing" : "set"}`);
			}
			const disabled = await t.mainEval<string>("process.mainModule.require('electron').app.commandLine.getSwitchValue('disable-features')");
			if (!disabled.split(",").includes("CalculateNativeWinOcclusion")) throw new Error(`disable-features lacks CalculateNativeWinOcclusion: ${disabled}`);
		},
	},
	{
		id: "s16",
		title: "Tray view: throttled while hidden, shows the current track and catches up after a track change while hidden",
		run: async (t) => {
			await ready(t);
			await play(t);
			const yt = await t.view("youtube");
			const ytTitle = () => yt.eval<string>("document.querySelector('#movie_player').getVideoData()?.title ?? ''");
			const TRAY = "__YTMD_TEST__.services.getProvider('trayView')";
			await t.mainEval(`${TRAY}.open().then(() => true)`);
			const tray = await t.view(/#\/trayview/);
			const showsTitle = async (title: string, what: string) =>
				await waitFor(async () => (await tray.eval<string>("document.body.innerText")).includes(title) || false, 10000, what);
			const first = await ytTitle();
			await showsTitle(first, `the tray view to show "${first}"`);
			const throttled = await t.mainEval<boolean>(`${TRAY}.getWindow().webContents.getBackgroundThrottling()`);
			if (!throttled) throw new Error("the tray view has background throttling off; it should rest while hidden");
			await t.mainEval(`${TRAY}.hide().then(() => true)`);
			await waitFor(async () => !(await t.mainEval<boolean>(`${TRAY}.getWindow().isVisible()`)) || false, 5000, "the tray view to hide");
			await yt.eval("document.querySelector('#movie_player').nextVideo()", { userGesture: true });
			const second = await waitFor(async () => {
				const x = await ytTitle();
				return (x && x !== first && x) || false;
			}, 30000, "YouTube Music to move to the next track");
			await sleep(3000); // the change lands while the tray view is hidden
			await t.mainEval(`${TRAY}.open().then(() => true)`);
			await showsTitle(second, `the reopened tray view to show the new track "${second}"`);
			console.log(`  s16: tray throttled while hidden=${throttled}; showed "${first}", then "${second}" after reopening`);
		},
	},
];
