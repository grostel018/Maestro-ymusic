import { describe, expect, it } from "vitest";
import { computeViewBounds, createFullscreenRestore } from "./layout";

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
});
