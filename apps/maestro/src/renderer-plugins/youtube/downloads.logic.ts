// Offline downloads, page side (spec 2026-11-17 §5): YouTube Music rows → download jobs. Pure.
import { largestArt, parseItem } from "./video-mode.match";
import { rowTrack } from "./video-mode.logic";

export type PageDownloadJob = { videoId: string; title: string; artist: string; album?: string; artUrl?: string; durationSec?: number };

type Obj = Record<string, any> | null | undefined;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const isEpisode = (type: string | undefined) => !!type && /PODCAST|EPISODE/.test(type);

/**
 * A list row (`musicResponsiveListItemRenderer`, search/playlist/album) or a queue row (`playlistPanelVideoRenderer`),
 * wrapped in its key or as Polymer's raw `el.data`. Null for podcast episodes and anything unexpected.
 */
export function jobFromRow(row: unknown): PageDownloadJob | null {
	const r = row as Obj;
	if (!r || typeof r !== "object") return null;
	try {
		const list = r.musicResponsiveListItemRenderer ?? (r.flexColumns ? r : null);
		if (list) {
			const hit = parseItem({ musicResponsiveListItemRenderer: list });
			if (!hit || !VIDEO_ID.test(hit.videoId) || isEpisode(hit.type)) return null;
			return { videoId: hit.videoId, title: hit.title, artist: hit.artist, album: hit.album, artUrl: hit.art, durationSec: hit.durationSec };
		}
		const queue = r.playlistPanelVideoRenderer ?? (r.lengthText || r.shortBylineText ? r : null);
		if (queue) {
			const t = rowTrack({ playlistPanelVideoRenderer: queue });
			if (!t || !VIDEO_ID.test(t.videoId) || !t.title || isEpisode(t.type)) return null;
			const thumbs: Obj[] = queue.thumbnail?.thumbnails ?? [];
			return { videoId: t.videoId, title: t.title, artist: t.artist, artUrl: largestArt(thumbs.at(-1)?.url), durationSec: t.durationSec || undefined };
		}
	} catch {
		/* a malformed row is skipped */
	}
	return null;
}

/** Jobs for every song row, each video once. */
export function jobsFromRows(rows: unknown[]): PageDownloadJob[] {
	const seen = new Set<string>();
	const jobs: PageDownloadJob[] = [];
	for (const row of rows) {
		const job = jobFromRow(row);
		if (!job || seen.has(job.videoId)) continue;
		seen.add(job.videoId);
		jobs.push(job);
	}
	return jobs;
}
