// Status lines for the lyrics view: what to show instead of lyrics, and a fix the user can make.
import type { LyricsStoreSnapshot } from "../store";

export function statusMessage(snap: LyricsStoreSnapshot): string {
	switch (snap.status) {
		case "loading":
			return "Loading lyrics…";
		case "empty":
			return "No lyrics found";
		case "error":
			return snap.errorMessage ? `Lyrics error: ${snap.errorMessage}` : "Failed to load lyrics";
		case "skipped":
			return snap.errorMessage ?? "Lyrics unavailable for this track";
		case "idle":
			return "Play a song to see lyrics";
		case "stock":
			return "";
		case "ready":
			return "No lyrics found";
		default:
			return "";
	}
}

/**
 * Actionable follow-up for an empty result. Better Lyrics is cache-first: a 401 means the song is
 * simply not cached yet, which the user can fix themselves (see https://lyrics-api-docs.boidu.dev/docs/authentication).
 */
export function statusHint(snap: LyricsStoreSnapshot): string | null {
	if (snap.status !== "empty") return null;
	switch (snap.betterLyricsMiss) {
		case "uncached":
			return "Better Lyrics hasn't cached this song yet. Play it once with the Better Lyrics browser extension, or add the lyrics on Unison, then replay.";
		case "invalid-key":
			return "Better Lyrics rejected the API key set in Settings → Player → Lyrics.";
		case "rate-limited":
			return "Better Lyrics is rate-limiting requests right now. Try again in a moment.";
		default:
			return null;
	}
}
