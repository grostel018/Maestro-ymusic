// yt-dlp and ffmpeg, fetched on first use from their official releases and checked against the published SHA-256
// lists (spec 2026-11-17 §5). Kept in a writable folder so yt-dlp can update itself.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { parseSha256Sums } from "./core";

export class BinaryError extends Error {}

export type Asset = { url: string; sumsUrl: string; name: string };

export const YT_DLP: Asset = {
	url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
	sumsUrl: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS",
	name: "yt-dlp.exe",
};
export const FFMPEG: Asset = {
	url: "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
	sumsUrl: "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/checksums.sha256",
	name: "ffmpeg-master-latest-win64-gpl.zip",
};

/** yt-dlp's JavaScript runtime for YouTube's challenges (Maestro's own exe can't run as Node: the RunAsNode fuse is off). */
export const DENO: Asset = {
	url: "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
	sumsUrl: "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip.sha256sum",
	name: "deno-x86_64-pc-windows-msvc.zip",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type Progress = (p: { name: "yt-dlp" | "ffmpeg" | "deno"; percent: number }) => void;
type FetchDeps = { fetch: typeof fetch; onProgress?: (percent: number) => void };

/** Downloads `asset` to `dest` (through a `.partial` file) and checks its hash; nothing is left behind on failure. */
export async function downloadVerified(asset: Asset, dest: string, deps: FetchDeps): Promise<void> {
	const partial = `${dest}.partial`;
	try {
		const sumsRes = await deps.fetch(asset.sumsUrl);
		if (!sumsRes.ok) throw new BinaryError(`checksum list unavailable (${sumsRes.status})`);
		const expected = parseSha256Sums(await sumsRes.text(), asset.name);
		if (!expected) throw new BinaryError(`no checksum published for ${asset.name}`);

		const res = await deps.fetch(asset.url);
		if (!res.ok || !res.body) throw new BinaryError(`download failed (${res.status})`);
		const total = Number(res.headers.get("content-length")) || 0;
		const hash = createHash("sha256");
		const out = createWriteStream(partial);
		// A full disk or a missing folder must reject, not throw an uncaught 'error' in the main process.
		let failure: Error | null = null;
		const failed = new Promise<never>((_, reject) =>
			out.once("error", (err) => {
				failure = err;
				reject(err);
			}),
		);
		failed.catch(() => undefined);
		let done = 0;
		try {
			for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
				if (failure) throw failure;
				hash.update(chunk);
				done += chunk.length;
				if (!out.write(chunk)) await Promise.race([new Promise<void>((r) => out.once("drain", () => r())), failed]);
				if (total) deps.onProgress?.(Math.round((done / total) * 100));
			}
		} finally {
			if (!failure) await Promise.race([new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve()))), failed]);
			else out.destroy();
		}
		if (failure) throw failure;
		if (hash.digest("hex") !== expected) throw new BinaryError(`checksum mismatch for ${asset.name}`);
		await fs.rename(partial, dest);
	} catch (err) {
		await fs.rm(partial, { force: true }).catch(() => undefined);
		throw err instanceof BinaryError ? err : new BinaryError(err instanceof Error ? err.message : String(err));
	}
}

/** Windows' own tar (bsdtar) reads zip files. */
function unzip(zip: string, destDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		// Windows' own bsdtar by full path: a GNU tar earlier on PATH (Git for Windows, MSYS) can't read zip files.
		const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
		const child = spawn(tar, ["-xf", zip, "-C", destDir], { windowsHide: true });
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new BinaryError(`unzip failed (${code})`))));
	});
}

async function findFile(dir: string, name: string): Promise<string | null> {
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) {
			const found = await findFile(p, name);
			if (found) return found;
		} else if (entry.name.toLowerCase() === name) return p;
	}
	return null;
}

/** Paths to yt-dlp and to the folder holding ffmpeg/ffprobe; downloads whatever is missing. */
/** Downloads a zip, takes `exes` out of it into `destDir`. */
async function installZip(asset: Asset, dir: string, destDir: string, exes: string[], deps: FetchDeps): Promise<void> {
	const zip = join(dir, asset.name);
	const tmp = join(dir, `${asset.name}-unpack`);
	try {
		await downloadVerified(asset, zip, deps);
		await fs.rm(tmp, { recursive: true, force: true });
		await fs.mkdir(tmp, { recursive: true });
		await unzip(zip, tmp);
		await fs.mkdir(destDir, { recursive: true });
		for (const exe of exes) {
			const found = await findFile(tmp, exe);
			if (!found) throw new BinaryError(`${exe} missing from ${asset.name}`);
			await fs.rm(join(destDir, exe), { force: true });
			await fs.rename(found, join(destDir, exe));
		}
	} finally {
		await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		await fs.rm(zip, { force: true }).catch(() => undefined);
	}
}

export async function ensureBinaries(dir: string, deps: { fetch: typeof fetch; onProgress?: Progress }): Promise<{ ytDlp: string; ffmpeg: string; deno: string }> {
	await fs.mkdir(dir, { recursive: true });
	const ytDlp = join(dir, YT_DLP.name);
	const ffmpegDir = join(dir, "ffmpeg");
	if (!existsSync(ytDlp)) {
		await downloadVerified(YT_DLP, ytDlp, { fetch: deps.fetch, onProgress: (percent) => deps.onProgress?.({ name: "yt-dlp", percent }) });
	}
	// Both are needed (ffprobe for the cover); a half-finished install is redone.
	if (!existsSync(join(ffmpegDir, "ffmpeg.exe")) || !existsSync(join(ffmpegDir, "ffprobe.exe"))) {
		await installZip(FFMPEG, dir, ffmpegDir, ["ffmpeg.exe", "ffprobe.exe"], { fetch: deps.fetch, onProgress: (percent) => deps.onProgress?.({ name: "ffmpeg", percent }) });
	}
	const deno = join(dir, "deno.exe");
	if (!existsSync(deno)) {
		await installZip(DENO, dir, dir, ["deno.exe"], { fetch: deps.fetch, onProgress: (percent) => deps.onProgress?.({ name: "deno", percent }) });
	}
	return { ytDlp, ffmpeg: ffmpegDir, deno };
}

export const updateDue = (lastMs: number | null, now: number): boolean => lastMs === null || now - lastMs >= DAY_MS;

/** `yt-dlp -U`, at most once a day (the stamp file's time records the last try). Never throws. */
export async function updateYtDlp(ytDlp: string, stampFile: string, now = Date.now()): Promise<void> {
	try {
		const last = existsSync(stampFile) ? (await fs.stat(stampFile)).mtimeMs : null;
		if (!updateDue(last, now) || !existsSync(ytDlp)) return;
		await fs.writeFile(stampFile, String(now));
		await new Promise<void>((resolve) => {
			const child = spawn(ytDlp, ["-U"], { windowsHide: true });
			child.on("error", () => resolve());
			child.on("exit", () => resolve());
		});
	} catch {
		/* an update that fails is tried again tomorrow */
	}
}

/** Forces the next `updateYtDlp` to run (after an error that looks like an outdated yt-dlp). */
export async function forceUpdateYtDlp(ytDlp: string, stampFile: string): Promise<void> {
	await fs.rm(stampFile, { force: true }).catch(() => undefined);
	await updateYtDlp(ytDlp, stampFile);
}
