// Sleep timer logic shared by the online player (transitions plugin) and the offline player (Downloads).

/** The sleep timer fades out over this many seconds before it pauses. */
export const SLEEP_FADE_S = 10;

/** `after-songs.left` counts the playing song: 1 means "stop after this song". */
export type SleepTimer = { kind: "off" } | { kind: "at"; endsAt: number } | { kind: "end-of-track" } | { kind: "after-songs"; left: number };

export type SleepAction = "none" | "fade" | "pause";

/** True when the timer ends with the playing song. */
const endsWithSong = (timer: SleepTimer) => timer.kind === "end-of-track" || (timer.kind === "after-songs" && timer.left <= 1);

/**
 * What the sleep timer wants now. `fading` is true once the fade started; `remaining` is the track's remaining
 * time (for "end of track" and the last of "after N songs").
 */
export function sleepAction(timer: SleepTimer, now: number, remaining: number, fading: boolean): SleepAction {
	if (timer.kind === "off") return "none";
	if (timer.kind === "after-songs" && !endsWithSong(timer)) return "none";
	const left = timer.kind === "at" ? (timer.endsAt - now) / 1000 : remaining;
	if (!Number.isFinite(left)) return "none";
	if (left <= 0.3) return "pause";
	if (!fading && left <= SLEEP_FADE_S) return "fade";
	return "none";
}

/** A song ended or was skipped past (counts), or the user went back (doesn't count). */
export function onSongBoundary(timer: SleepTimer, reason: "ended" | "skip" | "prev"): { timer: SleepTimer; stop: boolean } {
	if (reason === "prev" || timer.kind === "off" || timer.kind === "at") return { timer, stop: false };
	if (endsWithSong(timer)) return { timer: { kind: "off" }, stop: true };
	if (timer.kind !== "after-songs") return { timer, stop: false };
	return { timer: { kind: "after-songs", left: timer.left - 1 }, stop: false };
}

export function sleepLabel(timer: SleepTimer, now: number): string {
	if (timer.kind === "off") return "Sleep timer";
	if (timer.kind === "end-of-track") return "Sleep: end of track";
	if (timer.kind === "after-songs") return timer.left <= 1 ? "Sleep: after this song" : `Sleep: after ${timer.left} songs`;
	const min = Math.max(0, Math.ceil((timer.endsAt - now) / 60000));
	return `Sleep: ${min} min`;
}
