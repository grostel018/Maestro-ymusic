// Transition decisions (roadmap D5), pure: when a fade-out starts, when silence is skipped, when the sleep timer
// fades and pauses. The page side is transitions.renderer.ts. Silence detection follows pear-desktop@7c55260:
// src/plugins/skip-silences (MIT, after hark): a level threshold held for a while; the numbers are ours.

export const SILENCE_DB = -50;
export const SILENCE_HOLD_MS = 1500;
/** Within this much of the end, silence is the track's tail: go to the next track instead of seeking. */
export const TAIL_S = 20;
export const SKIP_STEP_S = 0.5;
export const SLEEP_FADE_S = 10;

/** Seconds before the end at which the fade-out starts, or null when the track is too short for one. */
export function fadeOutAt(duration: number, crossfade: number): number | null {
	if (!(crossfade > 0) || !Number.isFinite(duration) || duration < crossfade * 2 + 5) return null;
	return duration - crossfade;
}

export type SilenceAction = "skip" | "next" | null;

/** Feeds analyser levels; answers what to do once the level stayed under the threshold long enough. */
export class SilenceTracker {
	private quietSince: number | null = null;

	reset(): void {
		this.quietSince = null;
	}

	feed(levelDb: number | null, now: number, currentTime: number, duration: number): SilenceAction {
		if (levelDb == null || levelDb > SILENCE_DB || currentTime < 0.5) {
			this.quietSince = null;
			return null;
		}
		this.quietSince ??= now;
		if (now - this.quietSince < SILENCE_HOLD_MS) return null;
		return Number.isFinite(duration) && duration - currentTime < TAIL_S ? "next" : "skip";
	}
}

export type SleepTimer = { kind: "off" } | { kind: "at"; endsAt: number } | { kind: "end-of-track" };

export type SleepAction = "none" | "fade" | "pause";

/**
 * What the sleep timer wants now. `fading` is true once the fade started; `remaining` is the track's remaining
 * time (for "end of track").
 */
export function sleepAction(timer: SleepTimer, now: number, remaining: number, fading: boolean): SleepAction {
	if (timer.kind === "off") return "none";
	const left = timer.kind === "at" ? (timer.endsAt - now) / 1000 : remaining;
	if (!Number.isFinite(left)) return "none";
	if (left <= 0.3) return "pause";
	if (!fading && left <= SLEEP_FADE_S) return "fade";
	return "none";
}

export function sleepLabel(timer: SleepTimer, now: number): string {
	if (timer.kind === "off") return "Sleep timer";
	if (timer.kind === "end-of-track") return "Sleep: end of track";
	const min = Math.max(0, Math.ceil((timer.endsAt - now) / 60000));
	return `Sleep: ${min} min`;
}
