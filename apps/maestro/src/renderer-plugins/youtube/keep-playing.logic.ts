// Keep playing (spec 2026-11-17 §2): pure parts of keep-playing.renderer.ts.

/** YouTube's idle prompt ("Video paused. Continue watching?") and its confirm button. One place, so a YTM change is one edit. */
export const KEEP_PLAYING_SELECTORS = {
	popup: "ytmusic-popup-container",
	prompt: "ytmusic-you-there-renderer",
	confirm: "ytmusic-you-there-renderer button, ytmusic-you-there-renderer yt-button-renderer",
} as const;

/** A failed stream is retried once, then not again within this window for the same track. */
export const RETRY_WINDOW_MS = 60_000;

export function shouldRetry(state: { errors: number; lastErrorAt: number; now: number }): boolean {
	return state.errors === 0 || state.now - state.lastErrorAt >= RETRY_WINDOW_MS;
}
