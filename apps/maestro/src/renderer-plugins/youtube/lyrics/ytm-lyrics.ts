// YouTube Music's own lyrics for one exact video id, through InnerTube (`/next` → Lyrics tab → `/browse`). Replaces
// reading the Lyrics tab's DOM, which YTM does not always clear on a track change (the previous song's text showed up).

type Obj = Record<string, any> | null | undefined;

export type YtmLyrics = { text: string; source: string };
export type InnerTubeFetch = (path: string, body: Record<string, unknown>) => Promise<unknown>;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function runsText(value: Obj): string {
	const runs: Obj[] = value?.runs ?? [];
	return runs.map((r) => (typeof r?.text === "string" ? r.text : "")).join("");
}

/** Browse id of the Lyrics tab in a `/next` response, or null when the song has no lyrics. */
export function lyricsBrowseId(next: unknown): string | null {
	const tabs: Obj[] =
		(next as Obj)?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? [];
	if (!Array.isArray(tabs)) return null;
	for (const tab of tabs) {
		const r = tab?.tabRenderer;
		if (!r || r.unselectable) continue;
		const id = r.endpoint?.browseEndpoint?.browseId;
		if (typeof id === "string" && id.startsWith("MPLY")) return id;
	}
	return null;
}

/** Lyrics text and source ("Source: LyricFind" → "LyricFind") from the Lyrics tab's `/browse` response. */
export function parseYtmLyrics(browse: unknown): YtmLyrics | null {
	const sections: Obj[] = (browse as Obj)?.contents?.sectionListRenderer?.contents ?? [];
	if (!Array.isArray(sections)) return null;
	for (const section of sections) {
		const shelf = section?.musicDescriptionShelfRenderer;
		if (!shelf) continue;
		const text = runsText(shelf.description).trim();
		if (!text) continue;
		return { text, source: runsText(shelf.footer).trim().replace(/^Source:\s*/i, "") };
	}
	return null;
}

/** Null on no lyrics, an invalid id or any failure. */
export async function fetchYtmLyrics(videoId: string, fetch: InnerTubeFetch): Promise<YtmLyrics | null> {
	if (!VIDEO_ID.test(videoId)) return null;
	try {
		const browseId = lyricsBrowseId(await fetch("/next", { videoId, isAudioOnly: true }));
		if (!browseId) return null;
		return parseYtmLyrics(await fetch("/browse", { browseId }));
	} catch {
		return null;
	}
}
