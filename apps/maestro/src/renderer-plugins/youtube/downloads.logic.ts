// Offline downloads, page side (spec 2026-11-17 §5): YouTube Music rows → download jobs. Pure.

import { rowTrack } from "./video-mode.logic";
import { largestArt, parseItem } from "./video-mode.match";

export type DownloadCollection = { id: string; kind: "album" | "playlist"; title: string; artist?: string; artUrl?: string };
export type PageDownloadJob = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	artUrl?: string;
	durationSec?: number;
	/** Position on its album (1-based), when downloaded from the album page. */
	trackNumber?: number;
	/** The album or playlist it was downloaded from, so Downloads can show it the same way. */
	collection?: DownloadCollection;
};

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

function text(value: Obj): string {
	const runs: Obj[] = value?.runs ?? [];
	return runs.map((r) => (typeof r?.text === "string" ? r.text : "")).join("").trim();
}

/** The album or playlist a page shows, from its header (`musicResponsiveHeaderRenderer`, wrapped or raw). */
export function collectionFromHeader(header: unknown, browseId: string): DownloadCollection | null {
	const h = ((header as Obj)?.musicResponsiveHeaderRenderer ?? header) as Obj;
	const title = text(h?.title);
	if (!h || !title || !browseId) return null;
	const kindText = text(h.subtitle).split("•")[0]?.trim().toLowerCase() ?? "";
	const kind: DownloadCollection["kind"] = browseId.startsWith("MPRE") || /^(album|ep|single)$/.test(kindText) ? "album" : "playlist";
	const thumbs: Obj[] = h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
	const artist = text(h.straplineTextOne) || undefined;
	return { id: browseId, kind, title, artist, artUrl: largestArt(thumbs.at(-1)?.url) };
}

/**
 * Every song on an album or playlist page, completed from the page header: album rows carry no artist, album or cover
 * of their own (real album responses, 2026-11-17), so they take the album's.
 */
export function jobsFromPage(header: unknown, rows: unknown[], browseId: string): PageDownloadJob[] {
	const collection = collectionFromHeader(header, browseId);
	if (!collection) return jobsFromRows(rows);
	const isAlbum = collection.kind === "album";
	const seen = new Set<string>();
	const jobs: PageDownloadJob[] = [];
	for (const row of rows) {
		const job = jobFromRow(row);
		if (!job || seen.has(job.videoId)) continue;
		seen.add(job.videoId);
		const r = ((row as Obj)?.musicResponsiveListItemRenderer ?? row) as Obj;
		const index = Number(text(r?.index));
		jobs.push({
			...job,
			artist: job.artist || collection.artist || "",
			album: job.album ?? (isAlbum ? collection.title : undefined),
			artUrl: job.artUrl ?? collection.artUrl,
			trackNumber: isAlbum && Number.isInteger(index) && index > 0 ? index : undefined,
			collection,
		});
	}
	return jobs;
}
