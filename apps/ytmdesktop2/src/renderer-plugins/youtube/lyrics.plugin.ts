import definePlugin from "@plugins/utils";
import { getYtmd } from "@preload/preload-local";
import { readLineStyle } from "./lyrics/line-style";
import { createKaraokeStage, type KaraokeStage } from "./lyrics/stage";
import { createLyricsStore } from "./lyrics/store";
import { createTabMount, selectLyricsTab, type TabMountHandle } from "./lyrics/tab-mount";
import { seekPlayer, shouldSkipTrack, trackInfoFromMainWorld } from "./lyrics/track";
import type { TrackSearchInfo } from "./lyrics/types";
import { createLyricsRenderer, type LyricsGlow, type LyricsRenderApi } from "./lyrics/ui/apple";
import { lyricsPage } from "./lyrics.page";
import lyricsRenderer from "./lyrics.renderer";

const SEEK_OFFSET_MS = 10;

type LyricsLogger = { debug: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

interface LyricsRuntime {
	store: ReturnType<typeof createLyricsStore>;
	mount: TabMountHandle | null;
	renderer: LyricsRenderApi | null;
	stage: KaraokeStage | null;
	unsubStore: (() => void) | null;
	unsubSettings: (() => void) | null;
	unsubTrackId: (() => void) | null;
	domUtils: Window["domUtils"] | null;
	log: LyricsLogger | null;
	onSettingsChange: ((fn: (key: string, value: any) => void) => () => void) | null;
	active: boolean;
	tabSelected: boolean;
	started: boolean;
	lastVideoId: string | null;
	/** videoId the Lyrics tab was auto-opened for (once per track). */
	autoOpenedFor: string | null;
}

const runtime: LyricsRuntime = {
	store: createLyricsStore(),
	mount: null,
	renderer: null,
	stage: null,
	unsubStore: null,
	unsubSettings: null,
	unsubTrackId: null,
	domUtils: null,
	log: null,
	onSettingsChange: null,
	active: false,
	tabSelected: false,
	started: false,
	lastVideoId: null,
	autoOpenedFor: null,
};

const clampScale = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(2, Math.max(0.7, v)) : 1);

function readLyricsSettings(settings?: Record<string, any>) {
	const s = settings ?? window.__ytd_settings ?? {};
	return {
		enabled: !!s?.lyrics?.enabled,
		showTimeCodes: !!s?.lyrics?.showTimeCodes,
		showEvenIfInexact: s?.lyrics?.showEvenIfInexact !== false,
		lineBackground: s?.lyrics?.lineBackground !== false,
		lineStyle: readLineStyle(s?.lyrics?.lineStyle),
		providers: s?.lyrics?.providers,
		betterLyricsApiKey: typeof s?.lyrics?.betterLyricsApiKey === "string" ? s.lyrics.betterLyricsApiKey : "",
		autoOpenTab: s?.lyrics?.autoOpenTab !== false,
		preferWordSync: s?.lyrics?.preferWordSync !== false,
		fontScale: clampScale(s?.lyrics?.fontScale),
		glow: (["off", "song", "accent", "custom"].includes(s?.lyrics?.glow) ? s.lyrics.glow : "song") as LyricsGlow,
		glowColor: typeof s?.lyrics?.glowColor === "string" && /^#[0-9a-f]{6}$/i.test(s.lyrics.glowColor) ? s.lyrics.glowColor : "#ffffff",
	};
}

function fetchOptions(cfg: ReturnType<typeof readLyricsSettings>) {
	return {
		showEvenIfInexact: cfg.showEvenIfInexact,
		providers: cfg.providers,
		betterLyricsApiKey: cfg.betterLyricsApiKey,
		preferWordSync: cfg.preferWordSync,
	};
}

/** Soft gate for queue prefetch (duration often missing on queue rows). */
function canPrefetchTrack(info: TrackSearchInfo | null | undefined): info is TrackSearchInfo {
	if (!info?.videoId || !info.title?.trim()) return false;
	if (!info.artist?.trim()) return false;
	if (info.isLiveContent) return false;
	const type = String(info.musicVideoType ?? "");
	if (type.includes("PODCAST") || type.includes("EPISODE")) return false;
	return true;
}

async function prefetchNextTrack(cfg: ReturnType<typeof readLyricsSettings>) {
	try {
		const next = await lyricsPage.request("nextTrackInfo");
		if (!canPrefetchTrack(next)) return;
		runtime.store.prefetchForTrack(next, fetchOptions(cfg));
		runtime.log?.debug("lyrics: prefetch next", next.videoId, next.title);
	} catch (err) {
		runtime.log?.debug("lyrics: prefetch next failed", err);
	}
}

async function refreshTrack(expectVideoId?: string | null) {
	if (!runtime.active) return;
	const expected = expectVideoId ?? runtime.lastVideoId;
	// Cached track: show lyrics immediately; do not block UI on meta retry.
	const hadCache = expected ? runtime.store.applyCacheIfPresent(expected) : false;
	if (expected && !hadCache) runtime.store.setLoading(expected);

	const info = await trackInfoFromMainWorld({ expectVideoId: expected });
	if (!runtime.active) return;
	// Newer trackId:change won the race.
	if (expected && runtime.lastVideoId !== expected) return;

	const skip = shouldSkipTrack(info);
	if (skip || !info) {
		runtime.store.setSkipped(info?.videoId ?? expected ?? null, skip ?? "No track");
		return;
	}
	runtime.lastVideoId = info.videoId;
	const cfg = readLyricsSettings();
	await runtime.store.fetchForTrack(info, fetchOptions(cfg));
	if (!runtime.active) return;
	if (runtime.lastVideoId !== info.videoId) return;
	void prefetchNextTrack(cfg);
}

/**
 * With `autoOpenTab`, switch the player page to the Lyrics tab once lyrics for a new track are showing
 * (our overlay or stock YTM). Once per videoId, so a manual switch away is respected for that track.
 */
function maybeAutoOpenTab(snap: { status: string; videoId: string | null }) {
	if (!runtime.active || !snap.videoId) return;
	if (snap.status !== "ready" && snap.status !== "stock") return;
	if (runtime.autoOpenedFor === snap.videoId) return;
	runtime.autoOpenedFor = snap.videoId;
	if (!readLyricsSettings().autoOpenTab) return;
	if (!selectLyricsTab()) runtime.log?.debug("lyrics: auto-open tab skipped (header missing/disabled)");
}

// The view keeps its own clock (it reads the video's time each frame); it only runs while the Lyrics tab is shown.
function startTimePoll() {
	runtime.renderer?.setRunning(true);
}

function stopTimePoll() {
	runtime.renderer?.setRunning(false);
}

function unbindTrackWatch() {
	runtime.unsubTrackId?.();
	runtime.unsubTrackId = null;
}

function bindTrackWatch() {
	unbindTrackWatch();
	try {
		const ytmd = getYtmd();
		runtime.unsubTrackId = ytmd.onInternal("trackId:change", (id) => {
			const videoId = typeof id === "string" ? id : "";
			if (!videoId) {
				void refreshTrack(null);
				return;
			}
			runtime.lastVideoId = videoId;
			void refreshTrack(videoId);
		});
	} catch (err) {
		runtime.log?.error("lyrics: failed to bind trackId:change", err);
	}
}

async function startLyrics() {
	if (runtime.active) return;
	if (!runtime.domUtils) throw new Error("lyrics: not initialized");
	runtime.active = true;
	runtime.log?.debug("lyrics: start");

	runtime.mount = await createTabMount(runtime.domUtils, {
		onHostChange: () => {
			runtime.renderer?.repaint();
		},
		onTabSelectedChange: (selected) => {
			runtime.tabSelected = selected;
			if (selected) {
				startTimePoll();
			} else {
				stopTimePoll();
			}
		},
	});
	runtime.tabSelected = runtime.mount.isLyricsTabSelected();

	const onSeek = (timeMs: number) => {
		void seekPlayer((timeMs + SEEK_OFFSET_MS) / 1000).then((ok) => {
			if (!ok) runtime.log?.debug("lyrics: seek failed");
		});
	};
	let settings: { get(key: string): unknown; set(key: string, value: unknown): void } | null = null;
	try {
		settings = getYtmd().settings;
	} catch {
		settings = null;
	}
	const look = {
		fontScale: () => readLyricsSettings().fontScale,
		glow: () => ({ mode: readLyricsSettings().glow, color: readLyricsSettings().glowColor }),
		onScale: (delta: number) => {
			const next = Math.round(clampScale(readLyricsSettings().fontScale + delta) * 10) / 10;
			settings?.set("lyrics.fontScale", next);
		},
	};
	runtime.renderer = createLyricsRenderer(() => runtime.mount?.getHost() ?? null, {
		showTimeCodes: () => readLyricsSettings().showTimeCodes,
		lineStyle: () => readLyricsSettings().lineStyle,
		onSeek,
		...look,
	});
	runtime.stage = createKaraokeStage({ settings, lineStyle: () => readLyricsSettings().lineStyle, onSeek, fontScale: look.fontScale, glow: look.glow, onScale: look.onScale });

	runtime.unsubStore = runtime.store.subscribe((snap) => {
		runtime.renderer?.setSnapshot(snap);
		runtime.stage?.setSnapshot(snap);
		maybeAutoOpenTab(snap);
	});
	runtime.unsubSettings =
		runtime.onSettingsChange?.((key) => {
			if (["lyrics", "lyrics.showTimeCodes", "lyrics.lineStyle", "lyrics.fontScale", "lyrics.glow", "lyrics.glowColor"].includes(key)) {
				runtime.renderer?.repaint();
				runtime.stage?.repaint();
			}
			if (
				key === "lyrics.showEvenIfInexact" ||
				key === "lyrics.providers" ||
				key === "lyrics.betterLyricsApiKey" ||
				key === "lyrics.preferWordSync"
			) {
				runtime.store.clearCache();
				void refreshTrack();
			}
		}) ?? null;

	bindTrackWatch();
	if (runtime.tabSelected) startTimePoll();
	await refreshTrack();
	runtime.renderer.repaint();
}

function stopLyrics() {
	if (!runtime.active && !runtime.mount) return;
	runtime.log?.debug("lyrics: stop");
	runtime.active = false;
	runtime.tabSelected = false;
	runtime.lastVideoId = null;
	runtime.autoOpenedFor = null;
	stopTimePoll();
	unbindTrackWatch();
	runtime.unsubStore?.();
	runtime.unsubStore = null;
	runtime.unsubSettings?.();
	runtime.unsubSettings = null;
	runtime.renderer?.destroy();
	runtime.renderer = null;
	runtime.stage?.destroy();
	runtime.stage = null;
	runtime.mount?.destroy();
	runtime.mount = null;
	runtime.store.clear();
}

export default definePlugin(
	"lyrics",
	{
		enabled: true,
		displayName: "Lyrics",
	},
	{
		renderer: lyricsRenderer,
		async afterInit({ settings, domUtils, log, onSettingsChange }) {
			runtime.domUtils = domUtils;
			runtime.log = log;
			runtime.onSettingsChange = onSettingsChange;
			runtime.started = true;

			if (readLyricsSettings(settings).enabled) {
				await startLyrics();
			}
		},
		cmds: {
			async enable({ log, domUtils, onSettingsChange }) {
				log.debug("lyrics cmd enable");
				if (domUtils) runtime.domUtils = domUtils;
				if (onSettingsChange) runtime.onSettingsChange = onSettingsChange;
				await startLyrics();
			},
			async disable({ log }) {
				log.debug("lyrics cmd disable");
				stopLyrics();
			},
		},
	},
);
