// Apple Music-style lyrics view (roadmap F2), replacing the React view that re-rendered on every cross-world time
// tick (the owner found it laggy, with no clear current line). Plain DOM, built once per result:
// - its own clock: each animation frame reads the <video>'s currentTime directly (the DOM is shared with the page),
//   so nothing crosses worlds per frame;
// - the current line is large and bright, nearby lines dimmed, far lines dimmed and softly blurred;
// - scrolling is one GPU transform on a spring-like curve; line positions are measured on build and resize only;
// - word-synced lyrics fill word by word (a gradient driven by a CSS variable), line-synced ones line by line;
// - a gap of 4 s or more shows breathing dots; a click on a line seeks there; the wheel scrolls freely for 2.5 s.
// "stage" is the full-screen karaoke look (F6): bigger, centred.

import { withEstimatedTiming } from "../estimate";
import type { LyricsLineStyle } from "../line-style";
import { primaryActiveLineIndex } from "../lrc";
import { wordProgress } from "../progress";
import { lyricsProviderLabel } from "../providers/catalog";
import type { LyricsStoreSnapshot } from "../store";
import type { LyricLine } from "../types";
import { statusHint, statusMessage } from "./status";

export interface LyricsRenderApi {
	setSnapshot(snap: LyricsStoreSnapshot): void;
	/** Kept for the plugin's API; the view keeps its own clock. */
	setTime(timeMs: number): void;
	/** Start or stop the frame loop (the tab or the stage is shown or not). */
	setRunning(on: boolean): void;
	/** Rebuild for new settings or a new host. */
	repaint(): void;
	destroy(): void;
}

export type LyricsGlow = "off" | "song" | "accent" | "custom";

export interface LyricsUiOptions {
	showTimeCodes: () => boolean;
	lineStyle: () => LyricsLineStyle;
	onSeek: (timeMs: number) => void;
	variant?: "tab" | "stage";
	/** Text size multiplier (lyrics.fontScale). */
	fontScale?: () => number;
	/** Light circling the current line (lyrics.glow / lyrics.glowColor). */
	glow?: () => { mode: LyricsGlow; color: string };
	/** A−/A+ in the view: asks to change lyrics.fontScale by `delta`. */
	onScale?: (delta: number) => void;
}

/** Where the current line sits in the view (from the top); before the first line, the first line sits higher. */
const ANCHOR = 0.32;
const ANCHOR_BEFORE_START = 0.12;

/** The page clock trails what you hear a little. */
const LEAD_MS = 80;
const GAP_MS = 4000;
const MANUAL_SCROLL_MS = 2500;
/** Per-song timing nudges (ms, + = lyrics sooner), kept in this origin's localStorage. */
const OFFSETS_KEY = "ytmd-lyrics-offsets";
const OFFSET_EVENT = "ytmd-lyrics-offset";
const OFFSET_STEP_MS = 250;
const MAX_OFFSETS = 300;

function readOffsets(): Record<string, number> {
	try {
		const v = JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? "{}");
		return v && typeof v === "object" ? v : {};
	} catch {
		return {};
	}
}

function readOffset(videoId: string | null): number {
	const v = videoId ? readOffsets()[videoId] : 0;
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function writeOffset(videoId: string, ms: number): void {
	const all = readOffsets();
	delete all[videoId];
	if (ms) all[videoId] = ms;
	const keys = Object.keys(all);
	for (const k of keys.slice(0, Math.max(0, keys.length - MAX_OFFSETS))) delete all[k];
	try {
		localStorage.setItem(OFFSETS_KEY, JSON.stringify(all));
	} catch {
		/* storage blocked: this session only */
	}
	window.dispatchEvent(new CustomEvent(OFFSET_EVENT, { detail: { videoId, ms } }));
}

const offsetLabel = (ms: number) => (ms ? `${ms > 0 ? "+" : "−"}${(Math.abs(ms) / 1000).toFixed(2).replace(/0$/, "")} s` : "Sync");
const STYLE_ID = "ytmd-al-style";

const CSS = `
.ytmd-al { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; color: #fff;
	font-family: "YouTube Sans", Roboto, Arial, sans-serif; }
.ytmd-al-status { padding: 24px 12px; font-size: 16px; color: rgba(255,255,255,.7); }
.ytmd-al-hint { margin-top: 8px; font-size: 13px; color: rgba(255,255,255,.5); }
.ytmd-al-viewport { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 0 22px; margin: 0 -10px;
	-webkit-mask-image: linear-gradient(transparent 0, #000 14%, #000 78%, transparent 100%); mask-image: linear-gradient(transparent 0, #000 14%, #000 78%, transparent 100%); }
.ytmd-al-viewport.plain { overflow-y: auto; -webkit-mask-image: none; mask-image: none; }
.ytmd-al-scroller { padding: 45vh 0; will-change: transform; transition: transform 700ms cubic-bezier(.22, 1, .36, 1); }
.ytmd-al-viewport.plain .ytmd-al-scroller { padding: 12px 0 48px; transition: none; will-change: auto; }
.ytmd-al-line { position: relative; box-sizing: border-box; padding: 8px 12px; margin: 2px 0; border-radius: 12px; cursor: pointer;
	font-size: calc(26px * var(--ytmd-al-scale, 1)); font-weight: 700; line-height: 1.3; color: rgba(255,255,255,.3); transform-origin: left center; transform: scale(.95);
	filter: blur(1.4px); transition: transform 450ms cubic-bezier(.22, 1, .36, 1), color 300ms ease, filter 300ms ease; }
.ytmd-al-line[data-d="1"], .ytmd-al-line[data-d="2"] { filter: blur(.6px); color: rgba(255,255,255,.42); }
.ytmd-al-line[data-d="0"] { color: #fff; filter: none; transform: scale(1); }
.ytmd-al-line:not([data-d="0"]):hover { filter: none; background: rgba(255,255,255,.06); }
.ytmd-al-viewport.plain .ytmd-al-line { filter: none; transform: none; color: rgba(255,255,255,.85); cursor: default; font-size: calc(20px * var(--ytmd-al-scale, 1)); }
.ytmd-al-line.fill[data-d="0"] .ytmd-al-w, .ytmd-al-line.fill.lines[data-d="0"] .ytmd-al-text {
	--ytmd-al-base: linear-gradient(90deg, #fff var(--p, 0%), rgba(255,255,255,.38) var(--p, 0%));
	background: var(--ytmd-al-base); -webkit-background-clip: text; background-clip: text; color: transparent; }
.ytmd-al-part { display: block; }
.ytmd-al-part.alt { text-align: right; font-size: .82em; }
.ytmd-al-time { display: inline-block; min-width: 3.2em; margin-right: 10px; font-size: 12px; font-weight: 400; color: rgba(255,255,255,.45); vertical-align: middle; }
.ytmd-al-dots { display: flex; gap: 10px; padding: 18px 14px; opacity: .25; transition: opacity 300ms ease; }
.ytmd-al-dots span { width: 10px; height: 10px; border-radius: 50%; background: #fff; }
.ytmd-al-dots[data-d="0"] { opacity: 1; }
/* Countdown: the dots light up one by one through an intro or pause; the line comes when the third is lit. */
.ytmd-al-dots span { opacity: .3; transform: scale(.75); transition: opacity 250ms ease, transform 250ms ease; }
.ytmd-al-dots[data-d="0"][data-n="1"] span:nth-child(-n+1), .ytmd-al-dots[data-d="0"][data-n="2"] span:nth-child(-n+2),
.ytmd-al-dots[data-d="0"][data-n="3"] span { opacity: 1; transform: scale(1); background: var(--ytmd-al-glow, #fff); }
.ytmd-al-dots[data-d="0"][data-n="3"] span { animation: ytmd-al-breathe 1s ease-in-out infinite; }
@keyframes ytmd-al-breathe { 0%, 100% { transform: scale(.7); opacity: .5; } 50% { transform: scale(1.15); opacity: 1; } }
.ytmd-al-footer { padding: 6px 12px; font-size: 11px; color: rgba(255,255,255,.4); }
.ytmd-al.stage .ytmd-al-line { font-size: calc(clamp(32px, 4.6vw, 64px) * var(--ytmd-al-scale, 1)); text-align: center; transform-origin: center; padding: 14px 24px; }
.ytmd-al.stage .ytmd-al-dots { justify-content: center; }
.ytmd-al.stage .ytmd-al-dots span { width: 16px; height: 16px; }
/* Karaoke: the next lines smaller and quieter, so the sung line stands out. */
.ytmd-al.stage .ytmd-al-line:not([data-d="0"]) { transform: scale(.72); }
.ytmd-al.stage .ytmd-al-line[data-d="far"] { opacity: .5; }
.ytmd-al.stage .ytmd-al-footer { text-align: center; }
/* Glow: streaks of light in the song's (or theme's) color flow through the letters of the current line, above the
   fill, with a halo that follows the letter shapes. The sung word shines most; --ytmd-al-beat (0-1, set from the bass
   by lyrics-beat.renderer.ts) makes it pulse. */
@property --ytmd-al-fx1 { syntax: "<percentage>"; inherits: true; initial-value: 0%; }
@property --ytmd-al-fx2 { syntax: "<percentage>"; inherits: true; initial-value: 0%; }
@property --ytmd-al-fx3 { syntax: "<percentage>"; inherits: true; initial-value: 0%; }
.ytmd-al.glow .ytmd-al-line[data-d="0"] { background: none;
	animation: ytmd-al-fx1 2.4s linear infinite, ytmd-al-fx2 3.1s linear infinite, ytmd-al-fx3 4.3s ease-in-out infinite alternate; }
.ytmd-al.glow .ytmd-al-line[data-d="0"] :is(.ytmd-al-w, .ytmd-al-text, .ytmd-al-part) {
	--k: .45;
	--b: var(--ytmd-al-beat, .3);
	--hi: color-mix(in srgb, color-mix(in srgb, var(--ytmd-al-glow) 60%, #fff) calc(30% + 70% * var(--k) * (.4 + .6 * var(--b))), transparent);
	background-image:
		linear-gradient(115deg, transparent calc(var(--ytmd-al-fx1) - 14%), var(--hi) var(--ytmd-al-fx1), transparent calc(var(--ytmd-al-fx1) + 14%)),
		linear-gradient(245deg, transparent calc(var(--ytmd-al-fx2) - 10%), var(--hi) var(--ytmd-al-fx2), transparent calc(var(--ytmd-al-fx2) + 10%)),
		linear-gradient(180deg, transparent calc(var(--ytmd-al-fx3) - 22%), var(--hi) var(--ytmd-al-fx3), transparent calc(var(--ytmd-al-fx3) + 22%)),
		var(--ytmd-al-base, linear-gradient(#fff, #fff));
	-webkit-background-clip: text; background-clip: text; color: transparent;
	filter: drop-shadow(0 0 calc(2px + 12px * var(--k) * var(--b)) color-mix(in srgb, var(--ytmd-al-glow) calc(25% + 60% * var(--k)), transparent));
	transition: filter 120ms linear; }
.ytmd-al.glow .ytmd-al-line[data-d="0"] .ytmd-al-text, .ytmd-al.glow .ytmd-al-line[data-d="0"] .ytmd-al-w[data-now] { --k: 1; }
@keyframes ytmd-al-fx1 { from { --ytmd-al-fx1: -20%; } to { --ytmd-al-fx1: 120%; } }
@keyframes ytmd-al-fx2 { from { --ytmd-al-fx2: 120%; } to { --ytmd-al-fx2: -20%; } }
@keyframes ytmd-al-fx3 { from { --ytmd-al-fx3: -25%; } to { --ytmd-al-fx3: 125%; } }
.ytmd-al-size { position: absolute; top: 6px; right: 6px; z-index: 2; display: flex; gap: 4px; opacity: 0; transition: opacity 200ms ease; }
.ytmd-al:hover .ytmd-al-size, .ytmd-al-size:focus-within { opacity: 1; }
.ytmd-al-size button { all: unset; cursor: pointer; min-width: 28px; height: 26px; padding: 0 6px; box-sizing: border-box; text-align: center; border-radius: 8px;
	font: 600 12px/26px "YouTube Sans", Roboto, sans-serif; color: #fff; background: rgba(0,0,0,.45); }
.ytmd-al-size button:hover { background: rgba(255,255,255,.18); }
.ytmd-al-size .ytmd-al-sync { min-width: 52px; padding: 0 8px; box-sizing: border-box; text-align: center; border-radius: 8px;
	font: 500 11px/26px "YouTube Sans", Roboto, sans-serif; color: rgba(255,255,255,.8); background: rgba(0,0,0,.35); }
.ytmd-al-size .ytmd-al-sync.set { color: #fff; background: color-mix(in srgb, var(--ytmd-al-glow, #fff) 35%, rgba(0,0,0,.5)); }
.ytmd-al-size .ytmd-al-sep { width: 8px; }
.ytmd-al-size button:focus-visible { outline: 2px solid #fff; }
@media (prefers-reduced-motion: reduce) { .ytmd-al-scroller, .ytmd-al-line { transition: none; } .ytmd-al-dots[data-d="0"] span, .ytmd-al.glow .ytmd-al-line[data-d="0"] { animation: none; } }
`;

type Item = { el: HTMLElement; start: number; end: number; line: LyricLine | null; words: HTMLElement[] };

const fmt = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function ensureStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	(document.head ?? document.documentElement).appendChild(style);
}

export function createLyricsRenderer(getHost: () => HTMLElement | null, options: LyricsUiOptions): LyricsRenderApi {
	let snap: LyricsStoreSnapshot = { status: "idle", result: null, videoId: null };
	let host: HTMLElement | null = null;
	let viewport: HTMLElement | null = null;
	let scroller: HTMLElement | null = null;
	let items: Item[] = [];
	let lines: LyricLine[] = [];
	/** Line index → item index. */
	let lineItem: number[] = [];
	let centers: number[] = [];
	let viewH = 0;
	let current = -2;
	let raf = 0;
	/** The word being sung on the current line (the glow's brightest part). */
	let nowWord: HTMLElement | null = null;
	let running = false;
	let manualUntil = 0;
	let manualOffset = 0;
	let lastY = Number.NaN;
	let builtFor: unknown[] | null = null;
	let resize: ResizeObserver | null = null;
	let disposed = false;
	/** This song's timing nudge (see OFFSETS_KEY). */
	let offsetMs = 0;
	let syncLabel: HTMLElement | null = null;
	const showOffset = () => {
		if (!syncLabel) return;
		syncLabel.textContent = offsetLabel(offsetMs);
		syncLabel.classList.toggle("set", offsetMs !== 0);
	};
	const onOffset = (e: Event) => {
		const d = (e as CustomEvent<{ videoId: string; ms: number }>).detail;
		if (d?.videoId !== snap.videoId) return;
		offsetMs = d.ms;
		showOffset();
	};
	window.addEventListener(OFFSET_EVENT, onOffset);

	const video = () => document.querySelector<HTMLVideoElement>("video.html5-main-video, #movie_player video");

	const measure = () => {
		if (!viewport) return;
		viewH = viewport.clientHeight;
		centers = items.map((it) => it.el.offsetTop + it.el.offsetHeight / 2);
		lastY = Number.NaN;
		current = -2;
	};

	const setDistances = (active: number) => {
		// Only the items around the old and new positions change; the rest keep "far".
		const touched = new Set<number>();
		for (let d = -4; d <= 4; d++) {
			if (current >= 0) touched.add(current + d);
			if (active >= 0) touched.add(active + d);
		}
		for (const i of touched) {
			const it = items[i];
			if (!it) continue;
			const dist = active < 0 ? 9 : Math.abs(i - active);
			it.el.dataset.d = dist <= 2 ? String(dist) : "far";
		}
	};

	const scrollTo = (active: number) => {
		if (!scroller || !centers.length) return;
		const target = Math.round(viewH * (active < 0 ? ANCHOR_BEFORE_START : ANCHOR) - (centers[Math.max(0, active)] ?? 0)) + manualOffset;
		if (target === lastY) return;
		lastY = target;
		scroller.style.transform = `translate3d(0, ${target}px, 0)`;
	};

	const frame = () => {
		raf = 0;
		if (!running || disposed || !scroller || !lines.length) return;
		const v = video();
		const t = (v ? v.currentTime * 1000 : 0) + LEAD_MS + offsetMs;
		// The active item: a line, or the dots of the gap we are in.
		const li = primaryActiveLineIndex(lines, t);
		let active = li >= 0 ? lineItem[li] : -1;
		const gap = items.findIndex((it) => !it.line && t >= it.start && t < it.end);
		if (gap >= 0) active = gap;
		if (active !== current) {
			setDistances(active);
			current = active;
			nowWord?.removeAttribute("data-now");
			nowWord = null;
		}
		// Countdown dots: how many are lit in the current gap.
		const gapItem = !items[active]?.line ? items[active] : undefined;
		if (gapItem && gapItem.end > gapItem.start) {
			const n = String(Math.min(3, 1 + Math.floor(((t - gapItem.start) / (gapItem.end - gapItem.start)) * 3)));
			if (gapItem.el.dataset.n !== n) gapItem.el.dataset.n = n;
		}
		if (Date.now() > manualUntil) {
			manualOffset = 0;
			scrollTo(active);
		}
		// Fill: the active line's words, or the line itself.
		const it = items[active];
		if (it?.line) {
			if (it.words.length) {
				const words = it.line.words ?? [];
				let now: HTMLElement | null = null;
				for (let i = 0; i < it.words.length; i++) {
					const p = Math.round(wordProgress(words[i], t) * 100);
					const el = it.words[i];
					// The word being sung, or the last one sung until the next starts (no dark gap between words).
					if (p > 0) now = el;
					if (el.dataset.p !== String(p)) {
						el.dataset.p = String(p);
						el.style.setProperty("--p", `${p}%`);
					}
				}
				if (now !== nowWord) {
					nowWord?.removeAttribute("data-now");
					now?.setAttribute("data-now", "");
					nowWord = now;
				}
			} else if (Number.isFinite(it.line.durationMs) && it.line.durationMs > 0) {
				const p = Math.round(Math.min(1, Math.max(0, (t - it.line.timeMs) / it.line.durationMs)) * 100);
				if (it.el.dataset.p !== String(p)) {
					it.el.dataset.p = String(p);
					it.el.style.setProperty("--p", `${p}%`);
				}
			}
		}
		raf = requestAnimationFrame(frame);
	};

	const loop = () => {
		if (raf || !running || disposed || !lines.length || document.hidden) return;
		raf = requestAnimationFrame(frame);
	};
	const onVisibility = () => {
		if (document.hidden && raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		} else loop();
	};
	document.addEventListener("visibilitychange", onVisibility);

	const build = () => {
		host = getHost();
		if (!host || disposed) return;
		ensureStyle();
		resize?.disconnect();
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		items = [];
		lines = [];
		lineItem = [];
		current = -2;
		nowWord = null;
		lastY = Number.NaN;
		offsetMs = readOffset(snap.videoId);
		syncLabel = null;
		const root = document.createElement("div");
		root.className = `ytmd-al${options.variant === "stage" ? " stage" : ""}`;
		root.style.setProperty("--ytmd-al-scale", String(options.fontScale?.() ?? 1));
		const glow = options.glow?.() ?? { mode: "off", color: "#ffffff" };
		if (glow.mode !== "off") {
			root.classList.add("glow");
			const color =
				glow.mode === "song" ? "var(--ytmd-thumbnail-accent, #ffffff)" : glow.mode === "accent" ? "var(--ytmd-accent, #ffffff)" : glow.color;
			root.style.setProperty("--ytmd-al-glow", color);
		}
		if (options.onScale) {
			const size = document.createElement("div");
			size.className = "ytmd-al-size";
			for (const [label, delta, title] of [
				["A−", -0.1, "Smaller lyrics"],
				["A+", 0.1, "Bigger lyrics"],
			] as const) {
				const b = document.createElement("button");
				b.type = "button";
				b.textContent = label;
				b.title = title;
				b.setAttribute("aria-label", title);
				b.addEventListener("click", (e) => {
					e.stopPropagation();
					options.onScale?.(delta);
				});
				size.appendChild(b);
			}
			// Timing nudge for synced lyrics: − = lyrics later, + = lyrics sooner, label resets it.
			if (snap.result?.lines?.length && snap.result.syncLevel !== "plain" && snap.videoId) {
				const id = snap.videoId;
				const sep = document.createElement("span");
				sep.className = "ytmd-al-sep";
				const nudge = (label: string, title: string, delta: number) => {
					const b = document.createElement("button");
					b.type = "button";
					b.textContent = label;
					b.title = title;
					b.setAttribute("aria-label", title);
					b.addEventListener("click", (e) => {
						e.stopPropagation();
						writeOffset(id, delta ? offsetMs + delta : 0);
					});
					return b;
				};
				const later = nudge("−", "Lyrics later (0.25 s)", -OFFSET_STEP_MS);
				const reset = nudge("", "Reset lyrics timing", 0);
				reset.className = "ytmd-al-sync";
				syncLabel = reset;
				const sooner = nudge("+", "Lyrics sooner (0.25 s)", OFFSET_STEP_MS);
				size.append(sep, later, reset, sooner);
				showOffset();
			}
			root.appendChild(size);
		}
		const result = snap.result;
		const synced = !!result?.lines?.length && result.syncLevel !== "plain";
		const hasText = synced || !!result?.plain;
		const message = snap.status === "ready" && hasText ? "" : statusMessage(snap);
		if (message || snap.status === "stock" || !hasText) {
			if (message) {
				const status = document.createElement("div");
				status.className = "ytmd-al-status";
				status.textContent = message;
				const hint = statusHint(snap);
				if (hint) {
					const h = document.createElement("div");
					h.className = "ytmd-al-hint";
					h.textContent = hint;
					status.appendChild(h);
				}
				root.appendChild(status);
			}
			host.replaceChildren(root);
			viewport = scroller = null;
			return;
		}

		const vp = document.createElement("div");
		vp.className = `ytmd-al-viewport${synced ? "" : " plain"}`;
		const sc = document.createElement("div");
		sc.className = "ytmd-al-scroller";
		vp.appendChild(sc);
		viewport = vp;
		scroller = sc;
		const fill = options.lineStyle() === "fill";
		const showTimes = options.showTimeCodes();

		if (synced && result?.lines) {
			// Line-synced lyrics fill word by word too, with timing estimated from syllables.
			lines = fill ? withEstimatedTiming(result.lines) : result.lines;
			let prevEnd = 0;
			lines.forEach((line, i) => {
				if (line.timeMs - prevEnd >= GAP_MS) {
					const dots = document.createElement("div");
					dots.className = "ytmd-al-dots";
					dots.dataset.d = "far";
					dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
					sc.appendChild(dots);
					items.push({ el: dots, start: prevEnd, end: line.timeMs, line: null, words: [] });
				}
				const el = document.createElement("div");
				el.className = `ytmd-al-line${fill ? " fill" : ""}`;
				el.dataset.d = "far";
				el.dataset.t = String(line.timeMs);
				if (showTimes) {
					const time = document.createElement("span");
					time.className = "ytmd-al-time";
					time.textContent = fmt(line.timeMs);
					el.appendChild(time);
				}
				const wordEls: HTMLElement[] = [];
				if (line.parts && line.parts.length > 1) {
					line.parts.forEach((part, pi) => {
						const p = document.createElement("span");
						p.className = `ytmd-al-part${pi % 2 ? " alt" : ""}`;
						p.textContent = part;
						el.appendChild(p);
					});
				} else if (fill && line.words?.length) {
					for (const w of line.words) {
						const span = document.createElement("span");
						span.className = "ytmd-al-w";
						span.textContent = w.text;
						el.appendChild(span);
						wordEls.push(span);
					}
				} else {
					const text = document.createElement("span");
					text.className = "ytmd-al-text";
					text.textContent = line.text;
					el.appendChild(text);
					el.classList.add("lines");
				}
				sc.appendChild(el);
				lineItem[i] = items.length;
				const dur = Number.isFinite(line.durationMs) ? line.durationMs : 0;
				items.push({ el, start: line.timeMs, end: line.timeMs + dur, line, words: wordEls });
				// Where the singing of this line ends: its last word, else its window (capped, so long gaps get dots).
				let end = line.timeMs + Math.min(dur, 8000);
				const last = line.words?.[line.words.length - 1];
				if (last) end = Math.min(end, last.timeMs + (Number.isFinite(last.durationMs) ? last.durationMs : 0));
				prevEnd = end;
			});
			sc.addEventListener("click", (e) => {
				const el = (e.target as Element | null)?.closest?.(".ytmd-al-line") as HTMLElement | null;
				const t = Number(el?.dataset.t);
				if (el && Number.isFinite(t)) {
					manualUntil = 0;
					options.onSeek(t);
				}
			});
			vp.addEventListener(
				"wheel",
				(e) => {
					e.preventDefault();
					manualUntil = Date.now() + MANUAL_SCROLL_MS;
					manualOffset -= e.deltaY;
					lastY = Number.NaN;
					scrollTo(current < 0 ? 0 : current);
				},
				{ passive: false },
			);
		} else {
			for (const text of (result?.plain ?? "").split(/\r?\n/)) {
				const el = document.createElement("div");
				el.className = "ytmd-al-line";
				el.textContent = text || " ";
				sc.appendChild(el);
			}
		}
		root.appendChild(vp);
		if (result) {
			const footer = document.createElement("div");
			footer.className = "ytmd-al-footer";
			const from = result.provider === "youtube-music" ? "YouTube Music (not synced)" : lyricsProviderLabel(result.provider);
			footer.textContent = `Lyrics from ${from}${result.inexact ? " (closest match)" : ""}`;
			root.appendChild(footer);
		}
		host.replaceChildren(root);
		resize = new ResizeObserver(() => {
			measure();
			if (Date.now() > manualUntil) scrollTo(current);
		});
		resize.observe(vp);
		measure();
		loop();
	};

	const rebuildIfNeeded = () => {
		const g = options.glow?.();
		const key: unknown[] = [snap.status, snap.result, snap.videoId, getHost(), options.lineStyle(), options.showTimeCodes(), options.fontScale?.(), g?.mode, g?.color];
		if (builtFor && builtFor.length === key.length && builtFor.every((v, i) => v === key[i]) && host?.isConnected) return;
		builtFor = key;
		build();
	};

	return {
		setSnapshot(next) {
			snap = next;
			rebuildIfNeeded();
		},
		setTime() {
			/* own clock */
		},
		setRunning(on) {
			running = on;
			if (on) {
				rebuildIfNeeded();
				loop();
			} else if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		},
		repaint() {
			builtFor = null;
			rebuildIfNeeded();
		},
		destroy() {
			disposed = true;
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			resize?.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener(OFFSET_EVENT, onOffset);
			getHost()?.replaceChildren();
		},
	};
}
