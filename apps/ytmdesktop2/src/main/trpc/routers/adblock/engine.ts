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
 * Loads the Ghostery ads-and-tracking engine from `cachePath`, or builds it from the prebuilt lists and
 * writes the cache. A stale cache is deleted first. Never throws: any failure resolves `null`.
 */
export async function loadEngine(opts: { cachePath: string; fetchImpl: typeof fetch; now?: () => number }): Promise<ElectronBlocker | null> {
	const now = opts.now ?? Date.now;
	try {
		const stat = await fs.stat(opts.cachePath).catch(() => null);
		if (stat && isEngineStale(stat.mtimeMs, now())) await fs.rm(opts.cachePath, { force: true });
		await fs.mkdir(path.dirname(opts.cachePath), { recursive: true });
		const build = () =>
			ElectronBlocker.fromLists((url: string) => opts.fetchImpl(url), adsAndTrackingLists, COSMETIC_OFF, {
				path: opts.cachePath,
				read: async (p) => new Uint8Array(await fs.readFile(p)),
				write: (p, buffer) => fs.writeFile(p, buffer),
			});
		let blocker = await build();
		if (blocker.config.loadCosmeticFilters !== false) {
			// a cache written before cosmetics were turned off carries the old config
			await fs.rm(opts.cachePath, { force: true });
			blocker = await build();
		}
		return blocker;
	} catch (e) {
		log.warn(`ad-block engine failed to load: ${(e as Error)?.message ?? e}`);
		return null;
	}
}
