// Between scenarios that share one launch: put the window and the player back to a known state,
// and detect settings a scenario changed (the runner then relaunches instead of leaking them).
import type { TestApp } from "./app.ts";
import { waitFor } from "./wait.ts";

const WIN = "__YTMD_TEST__.getMainWindow().main";
/** Keys that legitimately change during any run; ignored when comparing settings. */
const VOLATILE = ["adblock.stats", "state", "lastfm.name"];

/** The settings store, minus volatile keys, as a comparable string. */
export async function settingsFingerprint(t: TestApp): Promise<string> {
	return await t.mainEval<string>(`(() => {
		const s = JSON.parse(JSON.stringify(__YTMD_TEST__.services.getProvider("settings").instance ?? {}));
		for (const path of ${JSON.stringify(VOLATILE)}) {
			const parts = path.split(".");
			let o = s;
			for (const p of parts.slice(0, -1)) o = o?.[p];
			if (o) delete o[parts[parts.length - 1]];
		}
		return JSON.stringify(s);
	})()`);
}

/**
 * Leave HTML fullscreen first (its exit handler restores the remembered window state), then OS
 * fullscreen, unmaximize, restore, and size 1500x800 — waiting for each async window change to land.
 * Also pauses and resets mute and speed. Scenarios navigate themselves (`play()` loads the test track).
 */
export async function resetApp(t: TestApp): Promise<void> {
	const yt = await t.view("youtube");
	try {
		await yt.eval(
			`(async () => {
				if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
				const v = document.querySelector("video");
				document.querySelector("#movie_player")?.pauseVideo?.();
				if (v) { v.muted = false; v.playbackRate = 1; }
			})()`,
			{ userGesture: true },
		);
	} finally {
		yt.close();
	}
	await waitFor(async () => !(await t.mainEval<boolean>(`${WIN}.isFullScreen()`)), 5000, "HTML fullscreen to end");
	await t.mainEval(`(() => {
		const w = ${WIN};
		if (w.isMinimized()) w.restore();
		if (!w.isVisible()) w.show();
		if (w.isFullScreen()) w.setFullScreen(false);
	})()`);
	await waitFor(async () => !(await t.mainEval<boolean>(`${WIN}.isFullScreen()`)), 5000, "OS fullscreen to end");
	await t.mainEval(`(() => { const w = ${WIN}; if (w.isMaximized()) w.unmaximize(); })()`);
	await waitFor(async () => !(await t.mainEval<boolean>(`${WIN}.isMaximized()`)), 5000, "the window to unmaximize");
	await t.mainEval(`${WIN}.setSize(1500, 800)`);
	await waitFor(
		async () => {
			const s = await t.mainEval<{ size: number[]; max: boolean; full: boolean }>(
				`(() => { const w = ${WIN}; return { size: w.getSize(), max: w.isMaximized(), full: w.isFullScreen() }; })()`,
			);
			return s.size[0] === 1500 && s.size[1] === 800 && !s.max && !s.full;
		},
		5000,
		"the window to be a normal 1500x800 window",
	);
}
