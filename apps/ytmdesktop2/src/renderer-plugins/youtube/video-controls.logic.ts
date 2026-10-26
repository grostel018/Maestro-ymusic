// YouTube-grade video controls (roadmap C2). Pure decisions; the bar itself lives in video-controls.renderer.ts.
// YTM builds its player without YouTube's control bar (probe 2026-10-26), so ours drives the player API.

export type ControlAction =
	| { kind: "play-pause" }
	| { kind: "seek-by"; seconds: number }
	| { kind: "seek-fraction"; fraction: number }
	| { kind: "frame"; direction: 1 | -1 }
	| { kind: "speed-step"; direction: 1 | -1 }
	| { kind: "fullscreen" }
	| { kind: "mute" }
	| { kind: "captions" }
	| { kind: "pip" }
	| { kind: "theater" }
	| { kind: "exit" };

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">;

/** YouTube's watch-page keyboard shortcuts. Null for keys we leave alone (modifiers, typing, unknown keys). */
export function keyAction(e: KeyLike, target: EventTarget | null): ControlAction | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null;
	const el = target as HTMLElement | null;
	if (el && typeof el.closest === "function" && el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return null;
	switch (e.key) {
		case "k":
		case "K":
		case " ":
			return { kind: "play-pause" };
		case "j":
		case "J":
			return { kind: "seek-by", seconds: -10 };
		case "l":
		case "L":
			return { kind: "seek-by", seconds: 10 };
		case "ArrowLeft":
			return { kind: "seek-by", seconds: -5 };
		case "ArrowRight":
			return { kind: "seek-by", seconds: 5 };
		case ",":
			return { kind: "frame", direction: -1 };
		case ".":
			return { kind: "frame", direction: 1 };
		case "<":
			return { kind: "speed-step", direction: -1 };
		case ">":
			return { kind: "speed-step", direction: 1 };
		case "f":
		case "F":
			return { kind: "fullscreen" };
		case "m":
		case "M":
			return { kind: "mute" };
		case "c":
		case "C":
			return { kind: "captions" };
		case "i":
		case "I":
			return { kind: "pip" };
		case "t":
		case "T":
			return { kind: "theater" };
		case "Escape":
			return { kind: "exit" };
		default:
			if (/^[0-9]$/.test(e.key)) return { kind: "seek-fraction", fraction: Number(e.key) / 10 };
			return null;
	}
}

/** One frame at 30 fps, YouTube's frame-step size. */
export const FRAME_SECONDS = 1 / 30;

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 4;

export function clampSpeed(rate: number): number {
	if (!Number.isFinite(rate)) return 1;
	return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, rate)) * 100) / 100;
}

/** The next preset speed above or below `rate` (a custom rate steps to its neighbour preset). */
export function stepSpeed(rate: number, direction: 1 | -1): number {
	if (direction > 0) return SPEEDS.find((s) => s > rate + 1e-6) ?? Math.max(rate, SPEEDS[SPEEDS.length - 1]);
	return [...SPEEDS].reverse().find((s) => s < rate - 1e-6) ?? Math.min(rate, SPEEDS[0]);
}

export function speedLabel(rate: number): string {
	return rate === 1 ? "Normal" : `${Number(rate.toFixed(2))}×`;
}

const QUALITY_LABELS: Record<string, string> = {
	highres: "4320p",
	hd2880: "2880p",
	hd2160: "2160p 4K",
	hd1440: "1440p",
	hd1080: "1080p",
	hd720: "720p",
	large: "480p",
	medium: "360p",
	small: "240p",
	tiny: "144p",
	auto: "Auto",
};

export function qualityLabel(level: string): string {
	return QUALITY_LABELS[level] ?? level;
}

/** Player levels for the menu, highest first, "auto" last, unknown names dropped. */
export function qualityMenu(levels: readonly string[] | null | undefined): string[] {
	const order = Object.keys(QUALITY_LABELS);
	const known = (levels ?? []).filter((l) => l in QUALITY_LABELS && l !== "auto");
	return [...new Set(known)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).concat("auto");
}

export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
	const s = Math.floor(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export type CaptionTrack = { languageCode: string; displayName: string; kind?: string };

/** Caption tracks the player can show: its own list, named, auto-generated last. */
export function captionMenu(tracks: unknown): CaptionTrack[] {
	if (!Array.isArray(tracks)) return [];
	const out: CaptionTrack[] = [];
	for (const t of tracks as Record<string, unknown>[]) {
		const code = t?.languageCode;
		if (typeof code !== "string" || !code) continue;
		const name = typeof t.displayName === "string" && t.displayName ? t.displayName : typeof t.languageName === "string" ? t.languageName : code;
		out.push({ languageCode: code, displayName: name, kind: typeof t.kind === "string" ? t.kind : undefined });
	}
	return out.sort((a, b) => Number(a.kind === "asr") - Number(b.kind === "asr"));
}
