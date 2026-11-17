import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BinaryError, downloadVerified, updateDue } from "./binaries";
import { createIndex, type DownloadEntry } from "./index-store";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const fakeFetch = (files: Record<string, string>) => (async (url: string | URL) => {
	const body = files[String(url)];
	return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
}) as typeof fetch;

describe("downloadVerified", () => {
	it("keeps a file whose checksum matches", async () => {
		const dir = mkdtempSync(join(tmpdir(), "maestro-bin-"));
		const fetch = fakeFetch({ "https://x/a.exe": "hello", "https://x/sums": `${sha("hello")}  a.exe\n` });
		const dest = join(dir, "a.exe");
		await downloadVerified({ url: "https://x/a.exe", sumsUrl: "https://x/sums", name: "a.exe" }, dest, { fetch });
		expect(existsSync(dest)).toBe(true);
	});
	it("throws and leaves nothing behind on a checksum mismatch", async () => {
		const dir = mkdtempSync(join(tmpdir(), "maestro-bin-"));
		const fetch = fakeFetch({ "https://x/a.exe": "tampered", "https://x/sums": `${sha("hello")}  a.exe\n` });
		await expect(downloadVerified({ url: "https://x/a.exe", sumsUrl: "https://x/sums", name: "a.exe" }, join(dir, "a.exe"), { fetch })).rejects.toBeInstanceOf(BinaryError);
		expect(readdirSync(dir)).toEqual([]);
	});
	it("throws when the checksum list has no entry for the file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "maestro-bin-"));
		const fetch = fakeFetch({ "https://x/a.exe": "hello", "https://x/sums": "" });
		await expect(downloadVerified({ url: "https://x/a.exe", sumsUrl: "https://x/sums", name: "a.exe" }, join(dir, "a.exe"), { fetch })).rejects.toBeInstanceOf(BinaryError);
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe("updateDue", () => {
	it("updates yt-dlp at most once a day", () => {
		const day = 24 * 60 * 60 * 1000;
		expect(updateDue(null, 5 * day)).toBe(true);
		expect(updateDue(5 * day, 5 * day + day - 1)).toBe(false);
		expect(updateDue(5 * day, 6 * day)).toBe(true);
	});
});

describe("download index", () => {
	const entry = (videoId: string, file: string): DownloadEntry => ({ videoId, title: "T", artist: "A", file, addedAt: 1 });
	it("adds, finds, removes and survives a reload", () => {
		const file = join(mkdtempSync(join(tmpdir(), "maestro-idx-")), "downloads.json");
		const index = createIndex(file);
		index.add(entry("aaaaaaaaaaa", "a.m4a"));
		index.add(entry("bbbbbbbbbbb", "b.m4a"));
		expect(index.has("aaaaaaaaaaa")).toBe(true);
		index.remove("aaaaaaaaaaa");
		expect(createIndex(file).list().map((e) => e.videoId)).toEqual(["bbbbbbbbbbb"]);
	});
	it("drops entries whose file is gone", () => {
		const index = createIndex(join(mkdtempSync(join(tmpdir(), "maestro-idx-")), "downloads.json"));
		index.add(entry("aaaaaaaaaaa", "kept.m4a"));
		index.add(entry("bbbbbbbbbbb", "gone.m4a"));
		index.prune((p) => p === "kept.m4a");
		expect(index.list().map((e) => e.videoId)).toEqual(["aaaaaaaaaaa"]);
	});
	it("starts empty on a missing or corrupt file", () => {
		const dir = mkdtempSync(join(tmpdir(), "maestro-idx-"));
		expect(createIndex(join(dir, "none.json")).list()).toEqual([]);
	});
});
