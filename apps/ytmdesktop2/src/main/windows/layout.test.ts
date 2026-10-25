import { describe, expect, it } from "vitest";
import { computeViewBounds, createFullscreenRestore, nextSavedWindowState } from "./layout";

describe("computeViewBounds", () => {
	it("puts the toolbar on top and YouTube below it", () => {
		expect(computeViewBounds({ width: 1500, height: 800 }, { toolbarHeight: 36, htmlFullscreen: false })).toEqual({
			toolbar: { x: 0, y: 0, width: 1500, height: 36 },
			youtube: { x: 0, y: 36, width: 1500, height: 764 },
		});
	});

	it("gives YouTube the whole content in html fullscreen", () => {
		expect(computeViewBounds({ width: 1500, height: 800 }, { toolbarHeight: 36, htmlFullscreen: true })).toEqual({
			toolbar: null,
			youtube: { x: 0, y: 0, width: 1500, height: 800 },
		});
	});

	it("computeViewBounds clamps and rounds", () => {
		const { toolbar, youtube } = computeViewBounds({ width: 1500.6, height: 20 }, { toolbarHeight: 36, htmlFullscreen: false });
		for (const rect of [toolbar!, youtube]) {
			for (const v of Object.values(rect)) {
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(0);
			}
		}
		expect(youtube.height).toBe(0);
	});
});

describe("createFullscreenRestore", () => {
	it("restores maximized after html fullscreen", () => {
		const restore = createFullscreenRestore();
		restore.enter({ maximized: true, fullScreen: false });
		expect(restore.leave()).toEqual({ maximized: true, fullScreen: false });
		expect(restore.leave()).toBeNull();
	});

	it("peek shows the saved state without clearing it", () => {
		const restore = createFullscreenRestore();
		expect(restore.peek()).toBeNull();
		restore.enter({ maximized: true, fullScreen: false });
		expect(restore.peek()).toEqual({ maximized: true, fullScreen: false });
		expect(restore.leave()).toEqual({ maximized: true, fullScreen: false });
		expect(restore.peek()).toBeNull();
	});
});

describe("nextSavedWindowState", () => {
	const prev = { x: 100, y: 80, width: 1200, height: 700, maximized: false };
	const monitor = { x: 0, y: 0, width: 2560, height: 1440 };
	const normal = { bounds: { x: 10, y: 20, width: 1300, height: 750 }, maximized: false, minimized: false, fullScreen: false };

	it("takes the bounds of a normal window", () => {
		expect(nextSavedWindowState(prev, normal, null)).toEqual({ x: 10, y: 20, width: 1300, height: 750, maximized: false });
	});

	it("keeps the last normal bounds and records maximized for a maximized window", () => {
		expect(nextSavedWindowState(prev, { bounds: monitor, maximized: true, minimized: false, fullScreen: false }, null)).toEqual({ ...prev, maximized: true });
	});

	it("leaves a minimized window's state alone", () => {
		const max = { ...prev, maximized: true };
		expect(nextSavedWindowState(max, { bounds: { x: -32000, y: -32000, width: 160, height: 28 }, maximized: false, minimized: true, fullScreen: false }, null)).toEqual(max);
	});

	it("never saves fullscreen bounds and keeps the maximized state from before html fullscreen", () => {
		const inFullscreen = { bounds: monitor, maximized: false, minimized: false, fullScreen: true };
		expect(nextSavedWindowState(prev, inFullscreen, { maximized: true, fullScreen: false })).toEqual({ ...prev, maximized: true });
		expect(nextSavedWindowState(prev, inFullscreen, { maximized: false, fullScreen: false })).toEqual({ ...prev, maximized: false });
		expect(nextSavedWindowState({ ...prev, maximized: true }, inFullscreen, null)).toEqual({ ...prev, maximized: true });
	});

	it("treats a pending html fullscreen as fullscreen even before the window reports it", () => {
		expect(nextSavedWindowState(prev, { ...normal, bounds: monitor }, { maximized: false, fullScreen: false })).toEqual(prev);
	});
});
