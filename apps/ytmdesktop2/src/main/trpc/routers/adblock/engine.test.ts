import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isEngineStale, loadEngine } from "./engine";

const DAY = 86400e3;

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

	it("deletes a stale cache before loading", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-adblock-"));
		try {
			const cachePath = path.join(dir, "engine.bin");
			fs.writeFileSync(cachePath, "stale");
			const old = (Date.now() - 8 * DAY) / 1000;
			fs.utimesSync(cachePath, old, old);
			const fetchImpl = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
			await expect(loadEngine({ cachePath, fetchImpl })).resolves.toBeNull();
			expect(fs.existsSync(cachePath)).toBe(false);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
