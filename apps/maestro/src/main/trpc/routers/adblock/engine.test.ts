import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ElectronBlocker, Request } from "@ghostery/adblocker-electron";
import { describe, expect, it } from "vitest";
import { isEngineStale, loadEngine } from "./engine";

const DAY = 86400e3;

async function withDir(fn: (dir: string) => Promise<void>) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-adblock-"));
	try {
		await fn(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

const offline = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
const lists = (text: string) => (async (url: string) => new Response(url.endsWith("resources.json") ? "[]" : text)) as unknown as typeof fetch;
const blocks = (engine: ElectronBlocker, url: string) =>
	engine.match(Request.fromRawDetails({ url, sourceUrl: "https://music.youtube.com/", type: "xmlhttprequest" })).match;
const writeCachedEngine = (cachePath: string, filters: string, ageDays: number) => {
	fs.writeFileSync(cachePath, ElectronBlocker.parse(filters, { loadCosmeticFilters: false }).serialize());
	const t = (Date.now() - ageDays * DAY) / 1000;
	fs.utimesSync(cachePath, t, t);
};

describe("isEngineStale", () => {
	const now = Date.now();
	it("is stale after more than 7 days", () => {
		expect(isEngineStale(now - 8 * DAY, now)).toBe(true);
	});
	it("is fresh within 7 days", () => {
		expect(isEngineStale(now - DAY, now)).toBe(false);
	});
});

describe("loadEngine", () => {
	it("returns null when fetch rejects", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-adblock-"));
		try {
			const fetchImpl = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
			await expect(loadEngine({ cachePath: path.join(dir, "engine.bin"), fetchImpl })).resolves.toBeNull();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("keeps a stale cache and its engine when the refresh fails", async () => {
		await withDir(async (dir) => {
			const cachePath = path.join(dir, "engine.bin");
			writeCachedEngine(cachePath, "||ads.example.com^", 8);
			const before = fs.readFileSync(cachePath);
			const engine = await loadEngine({ cachePath, fetchImpl: offline });
			expect(engine).not.toBeNull();
			expect(blocks(engine!, "https://ads.example.com/x.js")).toBe(true);
			expect(fs.readFileSync(cachePath).equals(before)).toBe(true);
		});
	});

	it("rebuilds a cache written with cosmetics on, keeping it (cosmetics off) when the rebuild fails", async () => {
		await withDir(async (dir) => {
			const cachePath = path.join(dir, "engine.bin");
			fs.writeFileSync(cachePath, ElectronBlocker.parse("||ads.example.com^", { loadCosmeticFilters: true }).serialize());
			const kept = await loadEngine({ cachePath, fetchImpl: offline });
			expect(kept?.config.loadCosmeticFilters).toBe(false);
			expect(kept && blocks(kept, "https://ads.example.com/x.js")).toBe(true);
			const rebuilt = await loadEngine({ cachePath, fetchImpl: lists("||new.example.com^") });
			expect(rebuilt?.config.loadCosmeticFilters).toBe(false);
			expect(rebuilt && blocks(rebuilt, "https://new.example.com/x.js")).toBe(true);
		});
	});

	it("uses a fresh cache without fetching", async () => {
		await withDir(async (dir) => {
			const cachePath = path.join(dir, "engine.bin");
			writeCachedEngine(cachePath, "||ads.example.com^", 1);
			const engine = await loadEngine({ cachePath, fetchImpl: offline });
			expect(engine && blocks(engine, "https://ads.example.com/x.js")).toBe(true);
		});
	});

	it("replaces a stale cache once the fresh lists are built", async () => {
		await withDir(async (dir) => {
			const cachePath = path.join(dir, "engine.bin");
			writeCachedEngine(cachePath, "||old.example.com^", 8);
			const engine = await loadEngine({ cachePath, fetchImpl: lists("||new.example.com^") });
			expect(engine && blocks(engine, "https://new.example.com/x.js")).toBe(true);
			expect(engine && blocks(engine, "https://old.example.com/x.js")).toBe(false);
			expect(isEngineStale(fs.statSync(cachePath).mtimeMs, Date.now())).toBe(false);
			expect(fs.readdirSync(dir)).toEqual(["engine.bin"]);
		});
	});
});

describe("history allow-list", () => {
	it("keeps watch-history and playback-stats pings allowed over a list that blocks them", async () => {
		await withDir(async (dir) => {
			const block = ["||youtube.com/api/stats/", "||youtube.com/ptracking", "||youtube.com/youtubei/v1/log_event", "||youtube.com/api/stats/ads?"].join("\n");
			const engine = await loadEngine({ cachePath: path.join(dir, "engine.bin"), fetchImpl: lists(block) });
			expect(engine).not.toBeNull();
			for (const host of ["music.youtube.com", "www.youtube.com", "s.youtube.com"]) {
				for (const p of ["watchtime", "playback", "delayplay", "atr", "qoe"]) {
					expect(blocks(engine!, `https://${host}/api/stats/${p}?ns=yt&docid=x`), `${host} ${p}`).toBe(false);
				}
				expect(blocks(engine!, `https://${host}/ptracking?video_id=x`)).toBe(false);
			}
			// ad stats and other telemetry stay blocked
			expect(blocks(engine!, "https://music.youtube.com/api/stats/ads?ver=2")).toBe(true);
			expect(blocks(engine!, "https://music.youtube.com/youtubei/v1/log_event?alt=json")).toBe(true);
		});
	});

	it("is applied to an engine loaded from the cache", async () => {
		await withDir(async (dir) => {
			const cachePath = path.join(dir, "engine.bin");
			fs.writeFileSync(cachePath, ElectronBlocker.parse("||youtube.com/api/stats/", { loadCosmeticFilters: false }).serialize());
			const engine = await loadEngine({ cachePath, fetchImpl: offline });
			expect(engine && blocks(engine, "https://music.youtube.com/api/stats/watchtime?ns=yt")).toBe(false);
			expect(engine && blocks(engine, "https://music.youtube.com/api/stats/ads?ver=2")).toBe(true);
		});
	});
});
