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
