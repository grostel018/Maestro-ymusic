// Song ⇄ video matching for Song mode without YouTube's twins (roadmap C1b). Pure: parses YTM `/search` responses
// and picks the version of the playing track. The page side (search call, cache) lives in video-mode.search.ts.

import { hdArt } from "@shared/track/thumbnail";
import { artistMatchRatio, stringSimilarity } from "./lyrics/match";
import { cleanArtist, cleanTitle } from "./lyrics/normalize";
import { ATV } from "./video-mode.logic";

export const OMV = "MUSIC_VIDEO_TYPE_OMV";

/** What to look for: the song (ATV) of a music video, or the official music video (OMV) of a song. */
export type MatchKind = "song" | "video";

export type SearchHit = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
	type?: string;
	/** Largest artwork: square album art for songs, the video thumbnail for videos. */
	art?: string;
};

export type VersionMatch = SearchHit;

export type TrackQuery = { title: string; artist: string; durationSec: number };

/** Longest allowed length difference between the playing track and its other version. */
export const MAX_DURATION_GAP_SEC = 10;
/** Music videos often add an intro, skit or outro (some run 2 min or more): a song this much shorter still counts when title and artist are near exact. */
export const MAX_VIDEO_EXTRA_SEC = 180;
const STRONG = 0.9;
const MIN_TITLE = 0.8;
const MIN_ARTIST = 0.8;

/** Words that make a different recording; both sides must carry the same ones. */
const VARIANT = /\b(remix|live|cover|karaoke|instrumental|acoustic|akustik|slowed|sped[\s-]?up|nightcore|reverb|8d|mashup|demo|tribute)\b/gi;

type Obj = Record<string, any> | null | undefined;

function runsText(runs: Obj[] | undefined): string {
	return (runs ?? []).map((r) => (typeof r?.text === "string" ? r.text : "")).join("");
}

function parseDuration(text: string): number | undefined {
	if (!/^\d+(:\d{1,2}){1,2}$/.test(text)) return undefined;
	return text.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}

/** `=w60-h60-…` googleusercontent art at high resolution (see `hdArt`). */
export function largestArt(url: string | undefined): string | undefined {
	return url ? hdArt(url) : undefined;
}

function parseItem(item: Obj): SearchHit | null {
	const r = item?.musicResponsiveListItemRenderer;
	if (!r) return null;
	const col = (i: number): Obj[] => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
	const titleRuns = col(0);
	const watch = titleRuns[0]?.navigationEndpoint?.watchEndpoint;
	const videoId = watch?.videoId ?? r.playlistItemData?.videoId;
	const title = runsText(titleRuns).trim();
	if (typeof videoId !== "string" || !videoId || !title) return null;

	const sub = col(1);
	const pageType = (run: Obj) =>
		run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
	const artists = sub.filter((run) => pageType(run) === "MUSIC_PAGE_TYPE_ARTIST").map((run) => String(run?.text ?? ""));
	const segments = runsText(sub)
		.split(" • ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments[0] === "Song" || segments[0] === "Video") segments.shift();
	const album = sub.find((run) => pageType(run) === "MUSIC_PAGE_TYPE_ALBUM")?.text;
	const thumbs: Obj[] = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
	return {
		videoId,
		title,
		artist: artists.length ? artists.join(", ") : (segments[0] ?? ""),
		album: typeof album === "string" ? album : undefined,
		durationSec: parseDuration(segments.at(-1) ?? ""),
		type: watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
		art: largestArt(thumbs.at(-1)?.url),
	};
}

/** Result rows of a filtered YTM `/search` response. Anything unexpected yields fewer (or no) hits. */
export function parseSearch(response: unknown): SearchHit[] {
	const tabs = (response as Obj)?.contents?.tabbedSearchResultsRenderer?.tabs;
	const sections: Obj[] = (Array.isArray(tabs) ? tabs : []).flatMap((tab: Obj) => tab?.tabRenderer?.content?.sectionListRenderer?.contents ?? []);
	const hits: SearchHit[] = [];
	for (const section of sections) {
		for (const item of section?.musicShelfRenderer?.contents ?? []) {
			try {
				const hit = parseItem(item);
				if (hit) hits.push(hit);
			} catch {
				/* a malformed row is skipped */
			}
		}
	}
	return hits;
}

function variants(text: string): string {
	return [...new Set((text.match(VARIANT) ?? []).map((w) => w.toLowerCase().replace(/[\s-]/g, "")))].sort().join(",");
}

/** The playing track cleaned the way results are compared ("Artist - Song (Official Video)" → "Song"). */
export function cleanQuery(track: Pick<TrackQuery, "title" | "artist">): { title: string; artist: string } {
	const artist = cleanArtist(track.artist);
	return { artist, title: cleanTitle(track.title, artist) };
}

/**
 * Ways to read the playing track: as given, and for a video uploaded by a label or fan channel ("Atlantic Records":
 * "Artist - Song (Official Video)"), the artist and song from the title itself.
 */
function readings(track: Pick<TrackQuery, "title" | "artist">): { title: string; artist: string }[] {
	const out = [cleanQuery(track)];
	const dash = track.title.trim().split(/\s+[-–—]\s+/);
	if (dash.length >= 2) {
		const artist = cleanArtist(dash[0]);
		out.push({ artist, title: cleanTitle(dash.slice(1).join(" - "), artist) });
	}
	return out;
}

/** Search text: for a label upload, the artist and song read from the title instead of the channel name. */
export function searchQuery(track: Pick<TrackQuery, "title" | "artist">): string {
	const [given, fromTitle] = readings(track);
	const q = fromTitle && /\s[-–—]\s/.test(given.title) ? fromTitle : given;
	return `${q.title} ${q.artist}`.trim();
}

/** The best hit of the wanted kind, or null when none is close enough in title, artist, length and variant. */
export function pickMatch(track: TrackQuery, hits: SearchHit[], want: MatchKind): VersionMatch | null {
	if (!(track.durationSec > 0) || !track.title.trim()) return null;
	const qs = readings(track);
	const qVariants = variants(`${track.title} ${track.artist}`);
	const wantType = want === "song" ? ATV : OMV;
	let best: { hit: SearchHit; score: number } | null = null;
	for (const hit of hits) {
		if (hit.type !== wantType || hit.durationSec === undefined) continue;
		if (variants(`${hit.title} ${hit.artist}`) !== qVariants) continue;
		const hitArtist = cleanArtist(hit.artist);
		const hitTitle = cleanTitle(hit.title, hit.artist);
		let artist = 0;
		let title = 0;
		for (const q of qs) {
			const a = artistMatchRatio(q.artist, hitArtist);
			const t = stringSimilarity(q.title, hitTitle);
			if (a + t > artist + title) [artist, title] = [a, t];
		}
		if (artist < MIN_ARTIST || title < MIN_TITLE) continue;
		// The video is the longer one (song wanted while a video plays, or a video wanted while its song plays).
		const extra = want === "song" ? track.durationSec - hit.durationSec : hit.durationSec - track.durationSec;
		const gap = Math.abs(hit.durationSec - track.durationSec);
		const strong = artist >= STRONG && title >= STRONG;
		const limit = strong && extra > 0 ? MAX_VIDEO_EXTRA_SEC : MAX_DURATION_GAP_SEC;
		if (gap > limit) continue;
		const score = title * 0.5 + artist * 0.3 + (1 - gap / limit) * 0.2 - (gap > MAX_DURATION_GAP_SEC ? 0.1 : 0);
		if (!best || score > best.score) best = { hit, score };
	}
	return best ? { ...best.hit } : null;
}
