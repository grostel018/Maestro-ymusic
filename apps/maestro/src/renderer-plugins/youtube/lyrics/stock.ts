import { findLyricsBody } from "./selectors";

export type LyricsTabDisplayMode = "overlay" | "stock";

/** Overlay = our UI; stock = show native YTM lyrics, hide `#ytmd-lyrics-root`. */
export function setLyricsTabDisplayMode(mode: LyricsTabDisplayMode): void {
	findLyricsBody()?.setAttribute("data-ytmd-lyrics", mode);
}

export function clearLyricsTabDisplayMode(): void {
	findLyricsBody()?.removeAttribute("data-ytmd-lyrics");
}

/**
 * Prefer timed overlay. Plain/empty/error defer to stock YTM when present.
 */
export function resolveLyricsDisplay(input: {
	status: string;
	hasTimedLines: boolean;
	hasStock: boolean;
}): { mode: LyricsTabDisplayMode; status: "stock" | null } {
	if (input.hasTimedLines) return { mode: "overlay", status: null };
	if (input.status === "loading" || input.status === "idle" || input.status === "skipped") {
		return { mode: "overlay", status: null };
	}
	if (input.hasStock) return { mode: "stock", status: "stock" };
	return { mode: "overlay", status: null };
}
