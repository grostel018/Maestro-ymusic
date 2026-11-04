// Audio ⇄ video toggle (roadmap C1). Pure decisions; the page side lives in video-mode.renderer.ts.
// Approach after pear-desktop@7c55260:src/plugins/video-toggle (MIT): hide the video and show the cover when a
// track has no song version. Ours additionally swaps to YTM's own song/video twin ("counterpart") when one
// exists and sets YTM's queue playback mode so the next tracks follow.

export type VideoMode = "video" | "audio";

export const ATV = "MUSIC_VIDEO_TYPE_ATV";

type Renderer = Record<string, any> | null | undefined;

export type Twin = { videoId: string; endpoint: Record<string, unknown> };

export function normalizeVideoMode(value: unknown): VideoMode {
	return value === "audio" ? "audio" : "video";
}

export function playbackContentMode(mode: VideoMode): "ATV_PREFERRED" | "OMV_PREFERRED" {
	return mode === "audio" ? "ATV_PREFERRED" : "OMV_PREFERRED";
}

function musicVideoType(renderer: Renderer): string | undefined {
	return renderer?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
		?.musicVideoType;
}

function rendererId(renderer: Renderer): string | undefined {
	const id = renderer?.videoId ?? renderer?.navigationEndpoint?.watchEndpoint?.videoId;
	return typeof id === "string" && id ? id : undefined;
}

/**
 * The other version of the playing track in YTM's queue: the song (ATV) when `want` is audio, the music video when
 * `want` is video. Queue items with both versions are `playlistPanelVideoWrapperRenderer`s.
 */
export function findTwin(items: unknown[] | null | undefined, currentId: string, want: VideoMode): Twin | null {
	for (const item of items ?? []) {
		const wrapper = (item as Record<string, any> | null)?.playlistPanelVideoWrapperRenderer;
		if (!wrapper) continue;
		const primary = wrapper.primaryRenderer?.playlistPanelVideoRenderer as Renderer;
		const counterpart = wrapper.counterpart?.[0]?.counterpartRenderer?.playlistPanelVideoRenderer as Renderer;
		const ids = [rendererId(primary), rendererId(counterpart)];
		if (!ids.includes(currentId)) continue;
		for (const candidate of [primary, counterpart]) {
			const id = rendererId(candidate);
			if (!id || id === currentId) continue;
			const isSong = musicVideoType(candidate) === ATV;
			if ((want === "audio") !== isSong) continue;
			const endpoint = candidate?.navigationEndpoint;
			if (endpoint && typeof endpoint === "object") return { videoId: id, endpoint };
		}
	}
	return null;
}

function runsText(value: unknown): string {
	const runs = (value as { runs?: { text?: unknown }[] } | null)?.runs ?? [];
	return runs.map((r) => (typeof r?.text === "string" ? r.text : "")).join("");
}

/** Search details of a plain queue row ("Up next" prefetch); null for pairs, which already have both versions. */
export function rowTrack(item: unknown): { videoId: string; title: string; artist: string; durationSec: number; type?: string } | null {
	const r = (item as Record<string, any> | null)?.playlistPanelVideoRenderer as Renderer;
	const videoId = rendererId(r);
	if (!r || !videoId) return null;
	const length = runsText(r.lengthText);
	const durationSec = /^\d+(:\d{1,2}){1,2}$/.test(length) ? length.split(":").reduce((sum, part) => sum * 60 + Number(part), 0) : 0;
	return { videoId, title: runsText(r.title), artist: runsText(r.shortBylineText), durationSec, type: musicVideoType(r) };
}

/** The row's renderers and whether one of them is the selected (playing) row. */
function rowIds(item: unknown): { selected: boolean; ids: string[] } {
	const row = item as Record<string, any> | null;
	const wrapper = row?.playlistPanelVideoWrapperRenderer;
	const renderers: Renderer[] = wrapper
		? [wrapper.primaryRenderer?.playlistPanelVideoRenderer, wrapper.counterpart?.[0]?.counterpartRenderer?.playlistPanelVideoRenderer]
		: [row?.playlistPanelVideoRenderer];
	const ids = renderers.map(rendererId).filter((id): id is string => !!id);
	return { selected: renderers.some((r) => r?.selected === true), ids };
}

/** Index of the playing row in YTM's queue, or -1. */
export function playingIndex(items: unknown[] | null | undefined, videoId: string): number {
	return (items ?? []).findIndex((item) => {
		const row = rowIds(item);
		return row.selected && row.ids.includes(videoId);
	});
}

export type Counterpart = { videoId: string; title: string; artist: string; album?: string; durationSec?: number; type?: string; art?: string };

/**
 * Turns a plain queue row into a song/video pair the way YouTube sends them to Premium accounts, with `match` as the
 * counterpart. YTM then plays whichever side its playback mode prefers and maps the position between the two by the
 * segment map, so the queue stays as it is. `startTimeSeconds` makes the first switch continue where the row is now;
 * the caller removes it from the returned endpoint afterwards so later switches use YTM's own mapping.
 */
export function wrapWithCounterpart(
	item: unknown,
	match: Counterpart,
	opts: { primaryDurationSec: number; startTimeSeconds?: number },
): { item: Record<string, unknown>; watchEndpoint: Record<string, unknown> } | null {
	const primary = (item as Record<string, any> | null)?.playlistPanelVideoRenderer as Record<string, any> | undefined;
	const primaryEndpoint = primary?.navigationEndpoint?.watchEndpoint;
	if (!primary || !primaryEndpoint || !match.type) return null;
	const { params: _params, startTimeSeconds: _start, ...rest } = primaryEndpoint as Record<string, unknown>;
	const watchEndpoint: Record<string, unknown> = {
		...rest,
		videoId: match.videoId,
		watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { hasPersistentPlaylistPanel: true, musicVideoType: match.type } },
	};
	if (opts.startTimeSeconds && opts.startTimeSeconds > 0) watchEndpoint.startTimeSeconds = Math.floor(opts.startTimeSeconds);
	const byline = [match.artist, match.album].filter(Boolean).join(" • ");
	const durationMs = Math.round(Math.min(opts.primaryDurationSec, match.durationSec ?? opts.primaryDurationSec) * 1000);
	const length = match.durationSec ? `${Math.floor(match.durationSec / 60)}:${String(match.durationSec % 60).padStart(2, "0")}` : undefined;
	const counterpart = {
		...primary,
		videoId: match.videoId,
		title: { runs: [{ text: match.title }] },
		shortBylineText: { runs: [{ text: match.artist }] },
		longBylineText: { runs: [{ text: byline }] },
		thumbnail: match.art
			? { thumbnails: [match.type === ATV ? { url: match.art, width: 544, height: 544 } : { url: match.art, width: 480, height: 360 }] }
			: primary.thumbnail,
		lengthText: length ? { runs: [{ text: length }] } : primary.lengthText,
		navigationEndpoint: { watchEndpoint },
		// The row's menu (like, add to playlist, start mix) acts on the primary's id.
		menu: undefined,
		queueNavigationEndpoint: undefined,
	};
	const segment = { primaryVideoStartTimeMilliseconds: "0", counterpartVideoStartTimeMilliseconds: "0", durationMilliseconds: String(durationMs) };
	return {
		item: {
			playlistPanelVideoWrapperRenderer: {
				primaryRenderer: { playlistPanelVideoRenderer: primary },
				counterpart: [{ counterpartRenderer: { playlistPanelVideoRenderer: counterpart }, segmentMap: { segment: [segment] } }],
			},
		},
		watchEndpoint,
	};
}

export type VideoModeAction =
	/** Play the twin at the same position. */
	| { kind: "swap"; twin: Twin }
	/** No song version: keep the stream, hide the picture (and lower its quality). */
	| { kind: "hide-video" }
	/** Show the picture (restore quality). */
	| { kind: "show-video" }
	/** Songs without a video: nothing to show. */
	| { kind: "none" };

/** What to do for the playing track in `mode`. */
export function decideVideoMode(mode: VideoMode, track: { type: string | undefined; twin: Twin | null }): VideoModeAction {
	const isSong = track.type === ATV;
	if (mode === "audio") {
		if (isSong) return { kind: "none" };
		return track.twin ? { kind: "swap", twin: track.twin } : { kind: "hide-video" };
	}
	if (isSong) return track.twin ? { kind: "swap", twin: track.twin } : { kind: "none" };
	return { kind: "show-video" };
}

/** `V` toggles, unless the user is typing or holds a modifier. */
export function isToggleKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat">, target: EventTarget | null): boolean {
	if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
	if (e.key !== "v" && e.key !== "V") return false;
	const el = target as HTMLElement | null;
	if (!el || typeof el.closest !== "function") return true;
	return !el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}
