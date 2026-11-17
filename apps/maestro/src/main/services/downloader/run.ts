// Runs yt-dlp for one song. The YouTube session's cookies go to a per-run file that is always deleted afterwards
// and never logged; an error that looks like an outdated yt-dlp triggers one update and one retry.
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Session } from "electron";
import { forceUpdateYtDlp } from "./binaries";
import { buildArgs, type DownloadJob, looksOutdated, netscapeCookies, parseFinalPath, parseProgress } from "./core";

export type RunPaths = { ytDlp: string; ffmpeg: string; electron: string; outDir: string; tmpDir: string; stampFile: string };

export class DownloadError extends Error {}

export async function writeCookies(session: Session, dir: string): Promise<string> {
	const cookies = await session.cookies.get({ domain: "youtube.com" });
	await fs.mkdir(dir, { recursive: true });
	const file = join(dir, `cookies-${randomUUID()}.txt`);
	await fs.writeFile(file, netscapeCookies(cookies), { mode: 0o600 });
	return file;
}

function once(job: DownloadJob, paths: RunPaths, cookies: string | null, onProgress: (p: number) => void, signal: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		const args = buildArgs(job, { ffmpeg: paths.ffmpeg, electron: paths.electron, cookies, outDir: paths.outDir });
		const child = spawn(paths.ytDlp, args, {
			windowsHide: true,
			// yt-dlp runs Maestro's own binary as Node to solve YouTube's JavaScript challenges.
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		});
		let file: string | null = null;
		let stderr = "";
		let buffer = "";
		const onAbort = () => child.kill();
		signal.addEventListener("abort", onAbort, { once: true });
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const pct = parseProgress(line);
				if (pct !== null) onProgress(pct);
				file = parseFinalPath(line) ?? file;
			}
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-4000);
		});
		child.on("error", (err) => reject(new DownloadError(err.message)));
		child.on("exit", (code) => {
			signal.removeEventListener("abort", onAbort);
			if (signal.aborted) return reject(new DownloadError("cancelled"));
			if (code === 0 && file) return resolve(file);
			const last = stderr.split(/\r?\n/).filter((l) => l.startsWith("ERROR")).at(-1) ?? `yt-dlp exited with ${code}`;
			const error = new DownloadError(last.replace(/^ERROR:\s*/, ""));
			(error as DownloadError & { stderr?: string }).stderr = stderr;
			reject(error);
		});
	});
}

/** Downloads one song; resolves with the audio file's path. */
export async function runDownload(job: DownloadJob, paths: RunPaths, session: Session | null, onProgress: (p: number) => void, signal: AbortSignal): Promise<string> {
	const cookies = session ? await writeCookies(session, paths.tmpDir).catch(() => null) : null;
	try {
		try {
			return await once(job, paths, cookies, onProgress, signal);
		} catch (err) {
			const stderr = (err as { stderr?: string }).stderr ?? "";
			if (signal.aborted || !looksOutdated(stderr)) throw err;
			await forceUpdateYtDlp(paths.ytDlp, paths.stampFile);
			return await once(job, paths, cookies, onProgress, signal);
		}
	} finally {
		if (cookies) await fs.rm(cookies, { force: true }).catch(() => undefined);
	}
}
