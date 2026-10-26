// Finds the other version of a track through YTM's own `/search` (roadmap C1b). The call goes through the page's
// signed-in InnerTube client; results are cached (hits and misses) so each track costs at most one request a week.
import { cleanQuery, type MatchKind, parseSearch, pickMatch, type TrackQuery, type VersionMatch } from "./video-mode.match";

// YTM's search filter chips ("Songs", "Videos"), as ytmusicapi sends them.
export const SEARCH_PARAMS: Record<MatchKind, string> = {
	song: "EgWKAQIIAWoMEA4QChADEAQQCRAF",
	video: "EgWKAQIQAWoMEA4QChADEAQQCRAF",
};
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SEARCH_TIMEOUT_MS = 4000;
const STORAGE_KEY = "ytmd-av-matches";
const MAX_ENTRIES = 500;

type Entry = [at: number, match: VersionMatch | null];
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type MatchCache = {
	/** `undefined`: never looked up (or expired); `null`: looked up, no match. */
	get(key: string): VersionMatch | null | undefined;
	set(key: string, match: VersionMatch | null): void;
};

export const cacheKey = (videoId: string, want: MatchKind) => `${want}:${videoId}`;

/** In-memory cache backed by `localStorage`, entries expire after `CACHE_TTL_MS`. */
export function createMatchCache(storage: StorageLike | null, now: () => number = Date.now): MatchCache {
	const entries = new Map<string, Entry>();
	try {
		const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") as Record<string, Entry>;
		for (const [key, entry] of Object.entries(saved)) {
			if (Array.isArray(entry) && now() - entry[0] < CACHE_TTL_MS) entries.set(key, entry);
		}
	} catch {
		/* unreadable cache: start empty */
	}
	const save = () => {
		while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
		try {
			storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
		} catch {
			/* storage full or blocked: memory only */
		}
	};
	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) return undefined;
			if (now() - entry[0] >= CACHE_TTL_MS) {
				entries.delete(key);
				return undefined;
			}
			return entry[1];
		},
		set(key, match) {
			entries.delete(key);
			entries.set(key, [now(), match]);
			save();
		},
	};
}

export type SearchFetch = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export type FindRequest = TrackQuery & { videoId: string; want: MatchKind };

export type VersionFinder = {
	peek(videoId: string, want: MatchKind): VersionMatch | null | undefined;
	/** Resolves null on no match, timeout, error, or when a newer request replaced this one while it waited. */
	find(req: FindRequest): Promise<VersionMatch | null>;
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
			const clean = cleanQuery(req);
			const query = `${clean.title} ${clean.artist}`.trim();
			const res = await Promise.race([call("/search", { query, params: SEARCH_PARAMS[req.want] }), timeout]);
			if (res === "timeout") return null;
			const match = pickMatch(req, parseSearch(res), req.want);
			cache.set(key, match);
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
