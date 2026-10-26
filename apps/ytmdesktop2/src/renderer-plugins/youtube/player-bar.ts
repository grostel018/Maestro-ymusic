// YouTube Music serves more than one player bar. The classic `ytmusic-player-bar` carries the current queue item
// (`currentItem`), Polymer methods and `#button-shape-like` buttons. The newer `ytmusic-miniplayer` (web components:
// like-button-view-model, ytmusic-wiz-player-controls) has none of those, so this module reads the same facts
// from YTM's store when the classic bar is missing. Pure helpers are unit-tested in player-bar.test.ts.
import { queueItemHitsVideoId } from "./queue-continue.parse";
import { resolveYtmStore } from "./ytm-store";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

/** The player bar element in either layout, or null. */
export function playerBarHost(): HTMLElement | null {
	return (
		document.querySelector<HTMLElement>("ytmusic-app-layout>ytmusic-player-bar") ??
		document.querySelector<HTMLElement>("ytmusic-player-bar") ??
		document.querySelector<HTMLElement>("ytmusic-miniplayer")
	);
}

/** The classic bar only (it has the Polymer API: currentItem, queue, onRepeatButtonClick). */
export function classicPlayerBar<T extends HTMLElement = HTMLElement>(): T | null {
	return document.querySelector<T>("ytmusic-app-layout>ytmusic-player-bar") ?? document.querySelector<T>("ytmusic-player-bar");
}

/** The queue entry (as YTM stores it) for `videoId`, searching the queue then "Up next". */
export function findQueueItem(items: readonly unknown[], videoId: string): unknown {
	if (!videoId) return null;
	for (let i = items.length - 1; i >= 0; i--) if (queueItemHitsVideoId(items[i], videoId)) return items[i];
	return null;
}

/** The `playlistPanelVideoRenderer` of a queue entry for `videoId` (the primary or the counterpart version). */
export function rendererFor(item: unknown, videoId: string): Rec | null {
	if (!isRec(item)) return null;
	const wrapper = isRec(item.playlistPanelVideoWrapperRenderer) ? item.playlistPanelVideoWrapperRenderer : null;
	if (wrapper) {
		const primary = isRec(wrapper.primaryRenderer) ? wrapper.primaryRenderer.playlistPanelVideoRenderer : null;
		const counter = Array.isArray(wrapper.counterpart) && isRec(wrapper.counterpart[0]) ? wrapper.counterpart[0].counterpartRenderer : null;
		const counterpart = isRec(counter) ? counter.playlistPanelVideoRenderer : null;
		if (isRec(counterpart) && counterpart.videoId === videoId) return counterpart;
		return isRec(primary) ? primary : null;
	}
	if (isRec(item.playlistPanelVideoRenderer)) return item.playlistPanelVideoRenderer;
	return "longBylineText" in item ? item : null;
}

/** The album link in a renderer's byline runs. */
export function albumFromRenderer(renderer: unknown): { id: string; title: string } | undefined {
	const byline = isRec(renderer) && isRec(renderer.longBylineText) ? renderer.longBylineText : null;
	const runs = byline && Array.isArray(byline.runs) ? byline.runs : [];
	for (const run of runs) {
		if (!isRec(run)) continue;
		const browse = isRec(run.navigationEndpoint) && isRec(run.navigationEndpoint.browseEndpoint) ? run.navigationEndpoint.browseEndpoint : null;
		const configs = browse && isRec(browse.browseEndpointContextSupportedConfigs) ? browse.browseEndpointContextSupportedConfigs : null;
		const music = configs && isRec(configs.browseEndpointContextMusicConfig) ? configs.browseEndpointContextMusicConfig : null;
		if (music?.pageType === "MUSIC_PAGE_TYPE_ALBUM") return { id: String(browse?.browseId ?? ""), title: String(run.text ?? "") };
	}
	return undefined;
}

/** The current queue item: the classic bar's `currentItem`, else the store's entry for `videoId`. */
export function currentQueueItem(videoId: string): unknown {
	const fromBar = (classicPlayerBar() as (HTMLElement & { currentItem?: unknown }) | null)?.currentItem;
	if (fromBar) return fromBar;
	const queue = resolveYtmStore()?.getState()?.queue;
	return findQueueItem([...(queue?.items ?? []), ...(queue?.automixItems ?? [])], videoId);
}

/** The album of the playing track, from the current queue item. */
export function currentAlbum(videoId: string): { id: string; title: string } | undefined {
	return albumFromRenderer(rendererFor(currentQueueItem(videoId), videoId));
}

/** The player bar's like or dislike button, in either layout. */
export function likeButton(kind: "like" | "dislike"): HTMLElement | null {
	return (
		document.querySelector<HTMLElement>(`ytmusic-player-bar #button-shape-${kind}.${kind} button`) ??
		document.querySelector<HTMLElement>(`ytmusic-miniplayer ${kind}-button-view-model button`)
	);
}

/** YTM's repeat cycle, as its own button steps it. */
export function nextRepeatMode(mode: string | undefined): "NONE" | "REPEAT_ALL" | "REPEAT_ONE" {
	if (mode === "REPEAT_ALL") return "REPEAT_ONE";
	if (mode === "REPEAT_ONE") return "NONE";
	return "REPEAT_ALL";
}
