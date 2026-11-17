// Offline downloads (spec 2026-11-17 §5): the pure parts of running yt-dlp — names, arguments, output parsing.

export type DownloadJob = { videoId: string; title: string; artist: string; album?: string; artUrl?: string; durationSec?: number };
export type DownloadPaths = { ffmpeg: string; electron: string; cookies: string | null; outDir: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_BASE = 180;
const PROGRESS = "[maestro] ";
const FINAL = "[maestro-file] ";

export const isVideoId = (id: unknown): id is string => typeof id === "string" && VIDEO_ID.test(id);

/** "Artist - Title.ext", safe as a Windows file name. */
export function safeFileName(artist: string, title: string, ext: string): string {
	const a = artist.trim();
	const t = title.trim();
	let base = (a && t ? `${a} - ${t}` : a || t || "Untitled").replace(ILLEGAL, "_");
	base = base.slice(0, MAX_BASE).replace(/[. ]+$/, "") || "Untitled";
	if (RESERVED.test(base)) base = `_${base}`;
	return `${base}.${ext}`;
}

/** yt-dlp arguments for one song, as an array (never through a shell). */
export function buildArgs(job: DownloadJob, paths: DownloadPaths): string[] {
	if (!isVideoId(job.videoId)) throw new Error(`invalid video id: ${String(job.videoId)}`);
	const base = safeFileName(job.artist, job.title, "x").slice(0, -2);
	const outDir = paths.outDir.replace(/[\\/]+$/, "");
	const args = [
		`https://music.youtube.com/watch?v=${job.videoId}`,
		"--no-playlist",
		"-f",
		"bestaudio[ext=m4a]/bestaudio",
		// Audio only, in its own codec (no re-encode): m4a, or opus when that is all there is.
		"-x",
		"--embed-metadata",
		"--embed-thumbnail",
		"--convert-thumbnails",
		"jpg",
		// Square cover from the (often 16:9) thumbnail.
		"--ppa",
		"ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -vf crop=\"'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'\"",
		"--ffmpeg-location",
		paths.ffmpeg,
		"--js-runtimes",
		`node:${paths.electron}`,
		"--no-mtime",
		"--no-part",
		"--progress",
		"--newline",
		"--progress-template",
		`download:${PROGRESS}%(progress.downloaded_bytes)s/%(progress.total_bytes,progress.total_bytes_estimate)s`,
		"--print",
		`after_move:${FINAL}%(filepath)s`,
		"-o",
		`${outDir}/${base}.%(ext)s`,
	];
	if (paths.cookies) args.push("--cookies", paths.cookies);
	return args;
}

/** Percent from one of our progress lines, or null. */
export function parseProgress(line: string): number | null {
	if (!line.startsWith(PROGRESS)) return null;
	const [done, total] = line.slice(PROGRESS.length).trim().split("/").map(Number);
	if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
	return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** The finished file's path, from our `--print after_move` line. */
export function parseFinalPath(line: string): string | null {
	return line.startsWith(FINAL) ? line.slice(FINAL.length).trim() || null : null;
}

/** The hash of `name` in a `sha256sum` list ("<hash>  name" or "<hash> *name"). */
export function parseSha256Sums(text: string, name: string): string | null {
	for (const line of text.split(/\r?\n/)) {
		const m = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
		if (m && m[2].trim() === name) return m[1].toLowerCase();
	}
	return null;
}

export type CookieLike = { name: string; value: string; domain?: string; path?: string; secure?: boolean; expirationDate?: number };

/** The session's YouTube cookies as a Netscape cookie file, for `--cookies`. */
export function netscapeCookies(cookies: CookieLike[]): string {
	const lines = ["# Netscape HTTP Cookie File"];
	for (const c of cookies) {
		const domain = c.domain ?? "";
		if (!/(^|\.)youtube\.com$/i.test(domain)) continue;
		const sub = domain.startsWith(".") ? "TRUE" : "FALSE";
		const expires = Math.floor(c.expirationDate ?? 0);
		lines.push([domain, sub, c.path || "/", c.secure ? "TRUE" : "FALSE", String(expires), c.name, c.value].join("\t"));
	}
	return `${lines.join("\n")}\n`;
}

/** yt-dlp errors that usually mean it is out of date (YouTube changed something). */
export function looksOutdated(stderr: string): boolean {
	return /Unable to extract|nsig|signature|Sign in to confirm|Requested format is not available|HTTP Error 403/i.test(stderr);
}
