import fs from "node:fs/promises";
import path from "node:path";
import { adsAndTrackingLists, ElectronBlocker } from "@ghostery/adblocker-electron";
import { createLogger } from "@shared/utils/console";

const log = createLogger("services").child("adblock-engine");

/** The serialized engine is rebuilt from fresh lists once it is older than this. */
export const ENGINE_MAX_AGE_MS = 7 * 86400e3;

export function isEngineStale(mtimeMs: number, nowMs: number): boolean {
	return nowMs - mtimeMs > ENGINE_MAX_AGE_MS;
}

/** The upsell CSS plugin is the cosmetic layer; Ghostery's cosmetic preload and observer stay off. */
const COSMETIC_OFF = { loadCosmeticFilters: false };

/**
 * YouTube's watch-history and playback-stats pings. Tracker lists may block them, which would silently stop the
 * account's history and recommendations, so they are always allowed (applied on top of every loaded engine).
 */
export const HISTORY_ALLOW_FILTERS = [
	"@@||youtube.com/api/stats/watchtime",
	"@@||youtube.com/api/stats/playback",
	"@@||youtube.com/api/stats/delayplay",
	"@@||youtube.com/api/stats/atr",
	"@@||youtube.com/api/stats/qoe",
	"@@||youtube.com/ptracking",
];

/** Adds the history allow-list to `engine`. */
export function allowHistoryPings<T extends { updateFromDiff(diff: { added: string[] }): boolean }>(engine: T): T {
	engine.updateFromDiff({ added: HISTORY_ALLOW_FILTERS });
	return engine;
}

async function readCache(cachePath: string): Promise<ElectronBlocker | null> {
	try {
		return ElectronBlocker.deserialize(new Uint8Array(await fs.readFile(cachePath)));
	} catch {
		return null; // missing, corrupt, or written by another engine version
	}
}

/** Writes to a temp file then renames over the cache, so a failed write never leaves a broken or missing cache. */
async function writeCache(cachePath: string, data: Uint8Array): Promise<void> {
	const tmp = `${cachePath}.${process.pid}.tmp`;
	try {
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(tmp, data);
		await fs.rename(tmp, cachePath);
	} catch (e) {
		await fs.rm(tmp, { force: true }).catch(() => {});
		log.warn(`ad-block engine cache not written: ${(e as Error)?.message ?? e}`);
	}
}

/**
 * Loads the Ghostery ads-and-tracking engine from `cachePath`, or builds it from the lists and writes the cache.
 * A stale cache (or one written with cosmetics on) is rebuilt; it is replaced only once the new engine is built and
 * written, so a failed refresh keeps the old engine. Never throws: no engine at all resolves `null`.
 */
export async function loadEngine(opts: { cachePath: string; fetchImpl: typeof fetch; now?: () => number }): Promise<ElectronBlocker | null> {
	const now = opts.now ?? Date.now;
	let cached: ElectronBlocker | null = null;
	try {
		const stat = await fs.stat(opts.cachePath).catch(() => null);
		cached = stat ? await readCache(opts.cachePath) : null;
		const configOk = cached?.config.loadCosmeticFilters === false;
		if (cached && stat && configOk && !isEngineStale(stat.mtimeMs, now())) return allowHistoryPings(cached);
		// an old cache stays usable as a fallback, with cosmetics forced off
		if (cached && !configOk) (cached.config as { loadCosmeticFilters: boolean }).loadCosmeticFilters = false;

		const fresh = await ElectronBlocker.fromLists((url: string) => opts.fetchImpl(url), adsAndTrackingLists, COSMETIC_OFF);
		await writeCache(opts.cachePath, fresh.serialize());
		return allowHistoryPings(fresh);
	} catch (e) {
		if (cached) {
			log.warn(`ad-block engine refresh failed, keeping the cached engine: ${(e as Error)?.message ?? e}`);
			return allowHistoryPings(cached);
		}
		log.warn(`ad-block engine failed to load: ${(e as Error)?.message ?? e}`);
		return null;
	}
}
