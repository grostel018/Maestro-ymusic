// Window layout: the toolbar and YouTube views follow the window, and YouTube Music's own fullscreen
// button (HTML fullscreen) fills the screen without the toolbar.
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { computeViewBounds, type Rect } from "../../../src/main/windows/layout.ts";
import { launchApp, type Scenario, type TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { waitFor } from "../lib/wait.ts";

/** Same value as `TOOLBAR_HEIGHT` in src/main/domain/uiZoom.ts. */
const TOOLBAR_HEIGHT = 40;
const MW = "__YTMD_TEST__.getMainWindow()";

type Layout = { content: [number, number]; toolbar: Rect; toolbarAttached: boolean; youtube: Rect; maximized: boolean; fullScreen: boolean };

const readLayout = (t: TestApp) =>
	t.mainEval<Layout>(`(() => {
		const mw = ${MW}; const win = mw.main;
		return {
			content: win.getContentSize(),
			toolbar: mw.views.toolbarView.getBounds(),
			toolbarAttached: win.contentView.children.includes(mw.views.toolbarView),
			youtube: mw.views.youtubeView.getBounds(),
			maximized: win.isMaximized(),
			fullScreen: win.isFullScreen(),
		};
	})()`);

const winDo = (t: TestApp, code: string) => t.mainEval(`(() => { const win = ${MW}.main; ${code} })()`);
const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Waits until the views match `computeViewBounds` of the current content size; returns the layout. */
async function expectLayout(t: TestApp, htmlFullscreen: boolean, what: string): Promise<Layout> {
	return await waitFor(
		async () => {
			const l = await readLayout(t);
			const want = computeViewBounds({ width: l.content[0], height: l.content[1] }, { toolbarHeight: TOOLBAR_HEIGHT, htmlFullscreen });
			const ok = same(l.youtube, want.youtube) && (want.toolbar ? l.toolbarAttached && same(l.toolbar, want.toolbar) : !l.toolbarAttached);
			if (!ok) throw new Error(JSON.stringify(l));
			return l;
		},
		3000,
		what,
	);
}

async function ready(t: TestApp) {
	await waitFor(
		async () => (await t.mainEval<number>(`${MW}.main.contentView.children.length`)) === 2 || false,
		60000,
		"the loading view to be replaced by toolbar + YouTube",
	);
}

async function htmlFullscreenRoundTrip(t: TestApp, yt: CdpSession) {
	await yt.eval("document.querySelector('video').requestFullscreen()", { userGesture: true });
	await waitFor(async () => (await yt.eval<boolean>("!!document.fullscreenElement")) || false, 10000, "HTML fullscreen");
	const inside = await expectLayout(t, true, "YouTube to fill the content and the toolbar to be detached in HTML fullscreen");
	if (!inside.fullScreen) throw new Error("the window is not fullscreen during HTML fullscreen");
	await yt.eval("document.exitFullscreen()", { userGesture: true });
	await waitFor(async () => (await yt.eval<boolean>("!document.fullscreenElement")) || false, 10000, "leaving HTML fullscreen");
	await waitFor(async () => !(await readLayout(t)).fullScreen || false, 5000, "the window to leave fullscreen");
	return await expectLayout(t, false, "toolbar + YouTube after leaving HTML fullscreen");
}

type Saved = Rect & { maximized?: boolean };
const savedWindowState = (t: TestApp) => (parse(fs.readFileSync(path.join(t.profileDir, "window-state-root.yml"), "utf8")) as { "window-state": Saved })["window-state"];
/** Quitting must save the close handlers' state, so minimize-to-tray stays off. */
const QUIT_SETTINGS = { app: { minimizeTrayOverride: false } };

/** Enters HTML fullscreen, quits from it, checks the saved state, relaunches the same profile; returns the new layout. */
async function quitFromFullscreenAndRelaunch(t: TestApp, expectMaximized: boolean) {
	await play(t);
	const yt = await t.view("youtube");
	await yt.eval("document.querySelector('video').requestFullscreen()", { userGesture: true });
	await waitFor(async () => (await readLayout(t)).fullScreen || false, 10000, "the window to go fullscreen");
	const fullscreenBounds = await t.mainEval<Rect>(`${MW}.main.getBounds()`);
	await t.quit();
	const saved = savedWindowState(t);
	if (!!saved.maximized !== expectMaximized) throw new Error(`saved maximized=${saved.maximized}, expected ${expectMaximized}: ${JSON.stringify(saved)}`);
	if (saved.width >= fullscreenBounds.width && saved.height >= fullscreenBounds.height) throw new Error(`saved the fullscreen bounds ${JSON.stringify(saved)} (fullscreen ${JSON.stringify(fullscreenBounds)})`);
	const again = await launchApp({ profileDir: t.profileDir, settings: QUIT_SETTINGS });
	try {
		await ready(again);
		const l = await waitFor(async () => {
			const x = await readLayout(again);
			return (x.maximized === expectMaximized && !x.fullScreen && x) || false;
		}, 5000, `the relaunched window to be ${expectMaximized ? "maximized" : "normal"} and not fullscreen`);
		const bounds = await again.mainEval<Rect>(`${MW}.main.getBounds()`);
		console.log(`    saved ${JSON.stringify(saved)}; relaunched maximized=${l.maximized} fullScreen=${l.fullScreen} bounds ${JSON.stringify(bounds)}`);
		return { saved, bounds, layout: l };
	} finally {
		await again.close();
	}
}

export const scenarios: Scenario[] = [
	{
		id: "s31",
		smoke: true,
		title: "Half-screen and narrow windows: the video stays on screen at a usable size, the side panel inside the window, playback advancing",
		run: async (t) => {
			await ready(t);
			await play(t);
			const yt = await t.view("youtube");
			const measure = `(() => {
				const box = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right } : null; };
				const v = document.querySelector('video');
				const p = box('#player');
				const hit = p && document.elementFromPoint(p.x + p.w / 2, p.y + p.h / 2);
				return { player: p, panel: box('#side-panel'), innerWidth, onScreen: !!hit?.closest('ytmusic-player'), paused: v.paused, time: v.currentTime };
			})()`;
			type Measure = { player: { w: number; h: number }; panel: { x: number; right: number } | null; innerWidth: number; onScreen: boolean; paused: boolean; time: number };
			for (const width of [1300, 958, 800]) {
				await winDo(t, `win.setBounds({ x: 1, y: 0, width: ${width}, height: 1000 });`);
				await expectLayout(t, false, `the views at ${width} px`);
				const seen = await waitFor(
					async () => {
						const m = await yt.eval<Measure>(measure);
						if (m.player.w < 200 || m.player.h < 100) throw new Error(`player is ${m.player.w}x${m.player.h} at ${width} px`);
						if (m.panel && m.panel.x < m.innerWidth && m.panel.right > m.innerWidth + 1) throw new Error(`side panel runs to ${m.panel.right} in a ${m.innerWidth} px page`);
						if (!m.onScreen) throw new Error(`the player isn't what's on screen at ${width} px`);
						return m;
					},
					5000,
					`a usable player at ${width} px`,
				);
				await yt.screenshot(path.join(import.meta.dirname, "..", "results", `s31-${width}.png`));
				await waitFor(
					async () => {
						const m = await yt.eval<Measure>(measure);
						if (m.paused || m.time <= seen.time) throw new Error(`playback stuck at ${m.time}`);
						return true;
					},
					5000,
					`playback advancing at ${width} px`,
				);
				console.log(`  s31: ${width} px, player ${Math.round(seen.player.w)}x${Math.round(seen.player.h)}`);
			}
			// Tall as half a screen, with the artwork loaded: for a look at the background's lower edge.
			await winDo(t, "win.setBounds({ x: 1, y: 0, width: 958, height: 1031 });");
			await new Promise((r) => setTimeout(r, 4000));
			await yt.screenshot(path.join(import.meta.dirname, "..", "results", "s31-tall.png"));
		},
	},
	{
		id: "s2",
		smoke: true,
		reuse: true,
		title: "Views follow setSize, maximize and unmaximize",
		run: async (t) => {
			await ready(t);
			await winDo(t, "if (win.isMaximized()) win.unmaximize(); win.setSize(1200, 700);");
			await expectLayout(t, false, "views to match 1200x700");
			await winDo(t, "win.maximize();");
			await waitFor(async () => (await readLayout(t)).maximized || false, 5000, "the window to maximize");
			await expectLayout(t, false, "views to match the maximized window");
			await winDo(t, "win.unmaximize();");
			await waitFor(async () => !(await readLayout(t)).maximized || false, 5000, "the window to unmaximize");
			await expectLayout(t, false, "views to match the unmaximized window");
		},
	},
	{
		id: "s3",
		smoke: true,
		reuse: true,
		title: "HTML fullscreen fills the screen without the toolbar and restores on exit",
		run: async (t) => {
			await ready(t);
			await winDo(t, "if (win.isMaximized()) win.unmaximize(); win.setSize(1500, 800);");
			await play(t);
			const yt = await t.view("youtube");
			const after = await htmlFullscreenRoundTrip(t, yt);
			if (after.maximized) throw new Error("the window is maximized after leaving HTML fullscreen; it was not before");
		},
	},
	{
		id: "s3b",
		reuse: true,
		title: "HTML fullscreen from maximized returns to maximized",
		run: async (t) => {
			await ready(t);
			await winDo(t, "win.maximize();");
			await waitFor(async () => (await readLayout(t)).maximized || false, 5000, "the window to maximize");
			await play(t);
			const yt = await t.view("youtube");
			await htmlFullscreenRoundTrip(t, yt);
			await waitFor(async () => (await readLayout(t)).maximized || false, 5000, "the window to be maximized again after HTML fullscreen");
			await expectLayout(t, false, "views to match the maximized window after HTML fullscreen");
		},
	},
	{
		id: "s14",
		title: "Quitting during HTML fullscreen from maximized relaunches maximized, not fullscreen-sized",
		launch: { settings: QUIT_SETTINGS },
		run: async (t) => {
			await ready(t);
			await winDo(t, "win.maximize();");
			await waitFor(async () => (await readLayout(t)).maximized || false, 5000, "the window to maximize");
			await quitFromFullscreenAndRelaunch(t, true);
		},
	},
	{
		id: "s14b",
		title: "Quitting during HTML fullscreen from a 1200x700 window relaunches at 1200x700",
		launch: { settings: QUIT_SETTINGS },
		run: async (t) => {
			await ready(t);
			await winDo(t, "if (win.isMaximized()) win.unmaximize(); win.setSize(1200, 700);");
			await expectLayout(t, false, "views to match 1200x700");
			const { bounds } = await quitFromFullscreenAndRelaunch(t, false);
			if (bounds.width !== 1200 || bounds.height !== 700) throw new Error(`relaunched at ${bounds.width}x${bounds.height}, expected 1200x700`);
		},
	},
];
