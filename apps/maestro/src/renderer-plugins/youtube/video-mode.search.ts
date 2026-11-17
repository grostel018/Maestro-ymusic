// Finds the other version of a track through YTM's own `/search` (roadmap C1b). The call goes through the page's
// signed-in InnerTube client; results are cached (hits and misses) so each track costs at most one request a week.
import { type MatchKind, parseNextCounterpart, parseSearch, pickMatch, searchQuery, type TrackQuery, type VersionMatch } from "./video-mode.match";

// YTM's search filter chips ("Songs", "Videos"), as ytmusicapi sends them.
export const SEARCH_PARAMS: Record<MatchKind, string> = {
	song: "EgWKAQIIAWoMEA4QChADEAQQCRAF",
	video: "EgWKAQIQAWoMEA4QChADEAQQCRAF",
};
const DAY_MS = 24 * 60 * 60 * 1000;
/** YouTube Music's own song/video pairing: ground truth, kept a month. */
export const NEXT_TTL_MS = 30 * DAY_MS;
export const SEARCH_HIT_TTL_MS = 7 * DAY_MS;
/** A search miss is retried the next day (the catalogue changes, and so does our matching). */
export const SEARCH_MISS_TTL_MS = DAY_MS;
export const SEARCH_TIMEOUT_MS = 4000;
/** v2: v1 entries came from looser matching and may hold wrong picks, so they are dropped. */
const STORAGE_KEY = "ytmd-av-matches-v2";
const MAX_ENTRIES = 500;

export type MatchSource = "next" | "search";
type Entry = [at: number, match: VersionMatch | null, source: MatchSource];
type Saved = { e?: Record<string, Entry>; p?: string[] };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type MatchCache = {
	/** `undefined`: never looked up (or expired); `null`: looked up, no match (or pinned as wrong). */
	get(key: string): VersionMatch | null | undefined;
	set(key: string, match: VersionMatch | null, source?: MatchSource): void;
	/** "Wrong video?": this track has no other version, for good. */
	pin(key: string): void;
	unpin(key: string): void;
	isPinned(key: string): boolean;
};

export const cacheKey = (videoId: string, want: MatchKind) => `${want}:${videoId}`;

function ttl(entry: Entry): number {
	if (entry[2] === "next") return NEXT_TTL_MS;
	return entry[1] ? SEARCH_HIT_TTL_MS : SEARCH_MISS_TTL_MS;
}

/** In-memory cache backed by `localStorage`; entries expire by source, pins never do. */
export function createMatchCache(storage: StorageLike | null, now: () => number = Date.now): MatchCache {
	const entries = new Map<string, Entry>();
	const pins = new Set<string>();
	const fresh = (entry: Entry) => now() - entry[0] < ttl(entry);
	try {
		const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") as Saved;
		for (const [key, entry] of Object.entries(saved.e ?? {})) {
			if (Array.isArray(entry) && typeof entry[0] === "number" && fresh(entry)) entries.set(key, entry);
		}
		for (const key of saved.p ?? []) if (typeof key === "string") pins.add(key);
	} catch {
		/* unreadable cache: start empty */
	}
	const save = () => {
		while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
		try {
			storage?.setItem(STORAGE_KEY, JSON.stringify({ e: Object.fromEntries(entries), p: [...pins] } satisfies Saved));
		} catch {
			/* storage full or blocked: memory only */
		}
	};
	return {
		get(key) {
			if (pins.has(key)) return null;
			const entry = entries.get(key);
			if (!entry) return undefined;
			if (!fresh(entry)) {
				entries.delete(key);
				return undefined;
			}
			return entry[1];
		},
		set(key, match, source = "search") {
			entries.delete(key);
			entries.set(key, [now(), match, source]);
			save();
		},
		pin(key) {
			pins.add(key);
			entries.delete(key);
			save();
		},
		unpin(key) {
			pins.delete(key);
			save();
		},
		isPinned: (key) => pins.has(key),
	};
}

export type SearchFetch = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export type FindRequest = TrackQuery & { videoId: string; want: MatchKind };

export type VersionFinder = {
	peek(videoId: string, want: MatchKind): VersionMatch | null | undefined;
	/** Resolves null on no match, timeout, error, or when a newer request replaced this one while it waited. */
	find(req: FindRequest): Promise<VersionMatch | null>;
	pin(videoId: string, want: MatchKind): void;
	unpin(videoId: string, want: MatchKind): void;
	isPinned(videoId: string, want: MatchKind): boolean;
};

/**
 * One search in flight at a time. A request that arrives while one runs waits; a newer one replaces it (the user
 * moved on). Timeouts and errors are not cached, so the track is tried again next time.
 */
export function createVersionFinder(fetch: () => SearchFetch | null, cache: MatchCache, timeoutMs = SEARCH_TIMEOUT_MS): VersionFinder {
	let busy = false;
	let running: { key: string; promise: Promise<VersionMatch | null> } | null = null;
	let waiting: { req: FindRequest; promise: Promise<VersionMatch | null>; resolve: (m: VersionMatch | null) => void } | null = null;

	const run = async (req: FindRequest): Promise<VersionMatch | null> => {
		const key = cacheKey(req.videoId, req.want);
		const cached = cache.get(key);
		if (cached !== undefined) return cached;
		const call = fetch();
		if (!call) return null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), timeoutMs);
		});
		try {
			// YouTube Music's own pairing first: no guessing when it knows.
			const next = await Promise.race([
				call("/next", { videoId: req.videoId, playlistId: `RDAMVM${req.videoId}` }).catch(() => null),
				timeout,
			]);
			if (next === "timeout") return null;
			const paired = parseNextCounterpart(next, req.videoId, req.want);
			if (paired) {
				cache.set(key, paired, "next");
				return paired;
			}
			const query = searchQuery(req);
			const res = await Promise.race([call("/search", { query, params: SEARCH_PARAMS[req.want] }), timeout]);
			if (res === "timeout") return null;
			const match = pickMatch(req, parseSearch(res), req.want);
			cache.set(key, match, "search");
			return match;
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	};

	const drain = (req: FindRequest): Promise<VersionMatch | null> => {
		busy = true;
		const promise = run(req).finally(() => {
			busy = false;
			running = null;
			const next = waiting;
			waiting = null;
			if (next) void drain(next.req).then(next.resolve);
		});
		running = { key: cacheKey(req.videoId, req.want), promise };
		return promise;
	};

	return {
		peek: (videoId, want) => cache.get(cacheKey(videoId, want)),
		pin: (videoId, want) => cache.pin(cacheKey(videoId, want)),
		unpin: (videoId, want) => cache.unpin(cacheKey(videoId, want)),
		isPinned: (videoId, want) => cache.isPinned(cacheKey(videoId, want)),
		find(req) {
			const cached = cache.get(cacheKey(req.videoId, req.want));
			if (cached !== undefined) return Promise.resolve(cached);
			if (!busy) return drain(req);
			// The same track asked again shares the request already running or waiting.
			const key = cacheKey(req.videoId, req.want);
			if (running?.key === key) return running.promise;
			if (waiting && cacheKey(waiting.req.videoId, waiting.req.want) === key) return waiting.promise;
			waiting?.resolve(null);
			let resolve!: (m: VersionMatch | null) => void;
			const promise = new Promise<VersionMatch | null>((r) => {
				resolve = r;
			});
			waiting = { req, promise, resolve };
			return promise;
		},
	};
}
