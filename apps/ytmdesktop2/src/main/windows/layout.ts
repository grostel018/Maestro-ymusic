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
export function createFullscreenRestore(): { enter(state: WindowState): void; leave(): WindowState | null } {
	let saved: WindowState | null = null;
	return {
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
