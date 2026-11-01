export type Rect = { x: number; y: number; width: number; height: number };

type WindowState = { maximized: boolean; fullScreen: boolean };

/** Bounds of the toolbar and YouTube views for a content size. In html fullscreen the toolbar is hidden (`null`). */
export function computeViewBounds(content: { width: number; height: number }, opts: { toolbarHeight: number; htmlFullscreen: boolean }): { toolbar: Rect | null; youtube: Rect } {
	const width = Math.max(0, Math.round(content.width));
	const height = Math.max(0, Math.round(content.height));
	if (opts.htmlFullscreen) return { toolbar: null, youtube: { x: 0, y: 0, width, height } };
	const toolbarHeight = Math.min(height, Math.max(0, Math.round(opts.toolbarHeight)));
	return {
		toolbar: { x: 0, y: 0, width, height: toolbarHeight },
		youtube: { x: 0, y: toolbarHeight, width, height: height - toolbarHeight },
	};
}

/** Remembers the window state from before html fullscreen so leaving it can restore maximized/fullscreen. */
export function createFullscreenRestore(): { enter(state: WindowState): void; leave(): WindowState | null; peek(): WindowState | null } {
	let saved: WindowState | null = null;
	return {
		/** The state from before the current html fullscreen, or `null` outside it. */
		peek() {
			return saved ? { ...saved } : null;
		},
		enter(state) {
			// a repeated enter (without leave) keeps the state from before the first one
			if (!saved) saved = { ...state };
		},
		leave() {
			const prev = saved;
			saved = null;
			return prev;
		},
	};
}

/**
 * Whether a saved window can still be reached: enough of it overlaps some display. Not "fully inside": a snapped or
 * edge-dragged window on Windows reaches past its display by its invisible 7 px border.
 */
export function isReachableOnDisplays(win: Rect, displays: Rect[], min = { width: 200, height: 100 }): boolean {
	return displays.some((d) => {
		const width = Math.min(win.x + win.width, d.x + d.width) - Math.max(win.x, d.x);
		const height = Math.min(win.y + win.height, d.y + d.height) - Math.max(win.y, d.y);
		return width >= min.width && height >= min.height;
	});
}

/** What the window-state store keeps: the last normal (not maximized, minimized or fullscreen) bounds plus maximized. */
export type SavedWindowState = Rect & { maximized?: boolean };

/**
 * The window state to persist. Fullscreen bounds are monitor-sized and never saved: in fullscreen (or while html
 * fullscreen is pending, `preFullscreen` set) the last normal bounds stay and maximized is the pre-fullscreen value.
 */
export function nextSavedWindowState(
	prev: SavedWindowState | null,
	cur: { bounds: Rect; maximized: boolean; minimized: boolean; fullScreen: boolean },
	preFullscreen: WindowState | null,
): SavedWindowState | null {
	if (cur.fullScreen || preFullscreen) {
		if (!prev) return null;
		return { ...prev, maximized: preFullscreen ? preFullscreen.maximized : !!prev.maximized };
	}
	if (cur.minimized) return prev;
	if (cur.maximized) return prev ? { ...prev, maximized: true } : null;
	const { x, y, width, height } = cur.bounds;
	return { ...prev, x, y, width, height, maximized: false };
}
