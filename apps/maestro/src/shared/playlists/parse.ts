// Local playlists (roadmap G7): what's stored, and reading the files people import. No app or network access here.

export type PlaylistTrack = {
	/** Missing until found on YouTube Music: imports from Spotify or M3U only know title and artist. */
	videoId?: string;
	title: string;
	artist: string;
	durationSec?: number;
	/** Searched and nothing fit; not tried again. */
	notFound?: boolean;
};

export type Playlist = { id: string; name: string; tracks: PlaylistTrack[]; createdAt: number };

export type ImportedPlaylist = { name: string; tracks: PlaylistTrack[] };

export const MAX_IMPORT_TRACKS = 10_000;

const YT_ID = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})(?![\w-])/;

export const videoIdFromUrl = (text: string): string | undefined => YT_ID.exec(text)?.[1];

const baseName = (fileName: string) =>
	fileName
		.replace(/^.*[\\/]/, "")
		.replace(/\.[^.]+$/, "")
		.trim() || "Imported playlist";

/** "Artist - Title" (or just a title). */
function fromDashed(text: string): Pick<PlaylistTrack, "title" | "artist"> {
	const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(text.trim());
	return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: text.trim() };
}

function parseM3u(text: string): PlaylistTrack[] {
	const tracks: PlaylistTrack[] = [];
	let info: { title: string; artist: string; durationSec?: number } | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const extinf = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i.exec(line);
		if (extinf) {
			const seconds = Number(extinf[1]);
			info = { ...fromDashed(extinf[2]), ...(seconds > 0 ? { durationSec: Math.round(seconds) } : {}) };
			continue;
		}
		if (line.startsWith("#")) continue;
		const videoId = videoIdFromUrl(line);
		// A local file with no #EXTINF: its file name is the best guess at artist and title.
		const named = info ?? (videoId ? { title: "", artist: "" } : fromDashed(baseName(line)));
		if (named.title || videoId) tracks.push({ ...named, ...(videoId ? { videoId } : {}) });
		info = null;
	}
	return tracks;
}

/** Rows of a CSV: quoted fields, doubled quotes and line breaks inside quotes. */
export function parseCsvRows(text: string): string[][] {
	const first = text.split(/\r?\n/, 1)[0];
	const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === delimiter) {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim()));
}

function parseLines(text: string): PlaylistTrack[] {
	return text.split(/\r?\n/).flatMap((raw) => {
		const line = raw.trim();
		if (!line) return [];
		const videoId = videoIdFromUrl(line);
		return videoId ? [{ title: "", artist: "", videoId }] : [fromDashed(line)];
	});
}

function parseCsv(text: string): PlaylistTrack[] {
	const [header, ...rows] = parseCsvRows(text);
	if (!header) return [];
	const names = header.map((h) => h.trim().toLowerCase());
	const col = (...wanted: string[]) => names.findIndex((n) => wanted.includes(n));
	const title = col("track name", "title", "song", "song name", "track", "name");
	const artist = col("artist name(s)", "artist name", "artist", "artists");
	const url = col("url", "link", "youtube", "youtube url");
	const id = col("videoid", "video id", "video_id");
	const ms = col("duration (ms)", "track duration (ms)");
	const sec = col("duration", "duration (s)", "seconds");
	// No header we know: treat every row as a URL or "Artist - Title" in its first column.
	if (title < 0 && url < 0 && id < 0) return parseLines([header, ...rows].map((r) => r[0]).join("\n"));
	return rows.flatMap((r) => {
		const videoId = (id >= 0 && /^[\w-]{11}$/.test(r[id]?.trim() ?? "") ? r[id].trim() : undefined) ?? (url >= 0 ? videoIdFromUrl(r[url] ?? "") : undefined);
		const name = title >= 0 ? (r[title] ?? "").trim() : "";
		if (!name && !videoId) return [];
		const seconds = ms >= 0 ? Number(r[ms]) / 1000 : sec >= 0 ? Number(r[sec]) : 0;
		return [
			{
				title: name,
				artist: artist >= 0 ? (r[artist] ?? "").replace(/\s*;\s*/g, ", ").trim() : "",
				...(videoId ? { videoId } : {}),
				...(seconds > 0 ? { durationSec: Math.round(seconds) } : {}),
			},
		];
	});
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Spotify's data download (`Playlist1.json`: `{ playlists: [{ name, items: [{ track: { trackName, artistName } }] }] }`), or ours. */
function parseJson(text: string, fallbackName: string): ImportedPlaylist[] {
	const data = JSON.parse(text) as Obj | unknown[];
	const lists = Array.isArray(data) ? data : Array.isArray((data as Obj).playlists) ? ((data as Obj).playlists as unknown[]) : [data];
	return lists.flatMap((raw) => {
		const list = raw as Obj;
		const rows = (Array.isArray(list?.items) ? list.items : Array.isArray(list?.tracks) ? list.tracks : []) as Obj[];
		const tracks = rows.flatMap((row): PlaylistTrack[] => {
			const t = (row?.track as Obj) ?? row;
			const title = str(t?.trackName) || str(t?.title) || str(t?.name);
			const artist = str(t?.artistName) || str(t?.artist);
			const videoId = /^[\w-]{11}$/.test(str(t?.videoId)) ? str(t?.videoId) : undefined;
			return title || videoId ? [{ title, artist, ...(videoId ? { videoId } : {}) }] : [];
		});
		return tracks.length ? [{ name: str(list?.name) || fallbackName, tracks }] : [];
	});
}

/** Reads a playlist file by its contents and extension. Throws on a broken JSON file; an empty result means nothing was recognized. */
export function parsePlaylistFile(fileName: string, text: string): ImportedPlaylist[] {
	const name = baseName(fileName);
	const clean = text.replace(/^﻿/, "");
	const ext = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
	if (ext === "json" || (!ext && /^\s*[[{]/.test(clean))) {
		return parseJson(clean, name).map((p) => ({ ...p, tracks: p.tracks.slice(0, MAX_IMPORT_TRACKS) }));
	}
	const tracks = ext === "m3u" || ext === "m3u8" || /^#EXTM3U/i.test(clean) ? parseM3u(clean) : ext === "csv" ? parseCsv(clean) : parseLines(clean);
	return tracks.length ? [{ name, tracks: tracks.slice(0, MAX_IMPORT_TRACKS) }] : [];
}

export const isPlayable = (t: PlaylistTrack) => !!t.videoId;

/** Fisher–Yates; `random` is a parameter so tests can fix it. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Smart shuffle's order: `every` of your songs, then one recommendation, none twice. */
export function mixSmart(own: readonly string[], recommended: readonly string[], every = 3): string[] {
	const seen = new Set<string>();
	const once = (id: string) => {
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	};
	const mine = own.filter(once);
	const recs = recommended.filter(once);
	const out: string[] = [];
	let r = 0;
	mine.forEach((id, i) => {
		out.push(id);
		if ((i + 1) % every === 0 && r < recs.length) out.push(recs[r++]);
	});
	// Too few of your own songs to space them out: the rest of the recommendations follow.
	return [...out, ...recs.slice(r)];
}

/** Every video id under `rendererKey` in a YouTube response, in order. */
export function collectIds(value: unknown, rendererKey: string): string[] {
	const out: string[] = [];
	const walk = (v: unknown) => {
		if (Array.isArray(v)) {
			for (const x of v) walk(x);
			return;
		}
		if (!v || typeof v !== "object") return;
		for (const [k, child] of Object.entries(v)) {
			if (k === rendererKey) {
				const c = child as { videoId?: unknown; playlistItemData?: { videoId?: unknown } };
				const id = c?.videoId ?? c?.playlistItemData?.videoId;
				if (typeof id === "string") out.push(id);
			}
			walk(child);
		}
	};
	walk(value);
	return out;
}
