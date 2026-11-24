import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AfterInit, BaseProvider } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { ensureBinaries, updateYtDlp } from "@main/services/downloader/binaries";
import { type DownloadJob, isVideoId, isYoutubeImageUrl, safeFileName } from "@main/services/downloader/core";
import { createIndex, type DownloadEntry, type DownloadIndex } from "@main/services/downloader/index-store";
import { runDownload } from "@main/services/downloader/run";
import { ytDlpGate } from "@main/services/downloader/ytdlp-gate";
import { mediaUrl, registerMediaProtocol } from "@main/services/mediaProtocol";
import { YtmClient } from "@main/ytm/ytm-client";
import { app, dialog, session as electronSession, shell } from "electron";

export type DownloadState = "queued" | "binaries" | "downloading" | "done" | "error";
export type DownloadStatus = { videoId: string; title: string; artist: string; state: DownloadState; percent: number; error?: string };
export type DownloadItem = DownloadEntry & { url: string | null; artSrc: string | null; size: number };

/** Two songs at a time: fast, and gentle on someone's own YouTube session. */
const CONCURRENCY = 2;
const ART_DIR = ".art";

function cleanJob(raw: unknown): DownloadJob | null {
	const j = raw as Partial<DownloadJob> | null;
	if (!j || !isVideoId(j.videoId)) return null;
	const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
	const title = str(j.title).trim();
	if (!title) return null;
	const https = (u: unknown) => (typeof u === "string" && u.length <= 2000 && isYoutubeImageUrl(u) ? u : undefined);
	const c = j.collection;
	const collection =
		c && typeof c.id === "string" && /^[A-Za-z0-9_-]{2,200}$/.test(c.id) && (c.kind === "album" || c.kind === "playlist") && str(c.title).trim()
			? { id: c.id, kind: c.kind, title: str(c.title).trim(), artist: str(c.artist).trim() || undefined, artUrl: https(c.artUrl) }
			: undefined;
	return {
		videoId: j.videoId,
		title,
		artist: str(j.artist).trim(),
		album: str(j.album).trim() || undefined,
		artUrl: https(j.artUrl),
		durationSec: typeof j.durationSec === "number" && j.durationSec > 0 ? Math.round(j.durationSec) : undefined,
		trackNumber: typeof j.trackNumber === "number" && Number.isInteger(j.trackNumber) && j.trackNumber > 0 ? j.trackNumber : undefined,
		collection,
	};
}

/**
 * Offline downloads (spec 2026-11-17 §5): a queue that runs yt-dlp, an index of downloaded songs, and the
 * `maestro-media://` protocol that plays them. The YTM page asks through `downloads:add`; Maestro's UI through tRPC.
 */
export default class DownloadsProvider extends BaseProvider implements AfterInit {
	private index: DownloadIndex;
	private readonly statuses = new Map<string, DownloadStatus>();
	private readonly queue: DownloadJob[] = [];
	private readonly running = new Map<string, AbortController>();
	/** Jobs that failed, kept so they can be retried from the Downloads page. */
	private readonly failedJobs = new Map<string, DownloadJob>();
	private binaries: Promise<{ ytDlp: string; ffmpeg: string; deno: string }> | null = null;
	private folderPath: string;

	constructor() {
		super("downloads");
		this.index = createIndex(path.join(app.getPath("userData"), "downloads.json"));
		this.folderPath = this.readFolder();
		serverMain.on("downloads:add", (_ev, jobs: unknown) => void this.add(Array.isArray(jobs) ? jobs : [jobs]));
		serverMain.on("downloads:status-request", () => this.pushAll());
	}

	private get userData() {
		return app.getPath("userData");
	}
	private get queueFile() {
		return path.join(this.userData, "downloads-queue.json");
	}

	/** The offline player's queue and position, kept across restarts. Checked again on the page (`restoreQueue`). */
	getQueue(): unknown {
		try {
			return JSON.parse(readFileSync(this.queueFile, "utf8"));
		} catch {
			return null;
		}
	}

	async saveQueue(saved: unknown): Promise<void> {
		await writeFile(this.queueFile, JSON.stringify(saved));
	}

	private get settingsFile() {
		return path.join(this.userData, "downloads-settings.json");
	}
	private get binDir() {
		return path.join(this.userData, "bin");
	}

	private readFolder(): string {
		try {
			const saved = JSON.parse(readFileSync(this.settingsFile, "utf8")) as { folder?: unknown };
			if (typeof saved.folder === "string" && path.isAbsolute(saved.folder)) return saved.folder;
		} catch {
			/* first run */
		}
		return path.join(app.getPath("music"), "Maestro");
	}

	async AfterInit() {
		// By video id through the index: songs left in an older folder still play, and nothing else can be served.
		registerMediaProtocol(electronSession.defaultSession, (kind, videoId) => {
			const entry = this.index.get(videoId);
			return kind === "song" ? entry?.file : entry?.art;
		});
		const ytDlp = path.join(this.binDir, "yt-dlp.exe");
		if (existsSync(ytDlp)) void ytDlpGate.update(() => updateYtDlp(ytDlp, path.join(this.binDir, ".last-update")));
	}

	folder() {
		return this.folderPath;
	}

	/** Lets the user pick a new folder; `move` carries the downloaded files over. */
	async chooseFolder(move: boolean): Promise<string | null> {
		const res = await dialog.showOpenDialog({ title: "Downloads folder", defaultPath: this.folderPath, properties: ["openDirectory", "createDirectory"] });
		const to = res.canceled ? null : res.filePaths[0];
		if (!to || path.resolve(to) === path.resolve(this.folderPath)) return null;
		if (move) {
			for (const entry of this.index.list()) {
				const target = path.join(to, path.basename(entry.file));
				try {
					await mkdir(to, { recursive: true });
					await rename(entry.file, target);
					const art = entry.art ? path.join(to, ART_DIR, path.basename(entry.art)) : undefined;
					if (entry.art && art) {
						await mkdir(path.dirname(art), { recursive: true });
						await rename(entry.art, art).catch(() => undefined);
					}
					this.index.add({ ...entry, file: target, art });
				} catch (err) {
					this.logger.warn(`could not move ${entry.file}: ${String(err)}`);
				}
			}
		}
		this.folderPath = to;
		await writeFile(this.settingsFile, JSON.stringify({ folder: to }));
		return to;
	}

	async list(): Promise<DownloadItem[]> {
		this.index.prune((p) => existsSync(p));
		const items: DownloadItem[] = [];
		for (const e of this.index.list().sort((a, b) => b.addedAt - a.addedAt)) {
			const size = await stat(e.file).then((s) => s.size).catch(() => 0);
			items.push({ ...e, url: mediaUrl("song", e.videoId), artSrc: e.art ? mediaUrl("art", e.videoId) : null, size });
		}
		return items;
	}

	status(): DownloadStatus[] {
		return [...this.statuses.values()];
	}

	downloadedIds(): string[] {
		return this.index.list().map((e) => e.videoId);
	}

	add(rawJobs: unknown[]): number {
		let added = 0;
		for (const raw of rawJobs.slice(0, 500)) {
			const job = cleanJob(raw);
			if (!job || this.index.has(job.videoId)) continue;
			const current = this.statuses.get(job.videoId);
			if (current && current.state !== "error" && current.state !== "done") continue;
			this.queue.push(job);
			this.setStatus(job, "queued", 0);
			added++;
		}
		this.pump();
		return added;
	}

	/** Tries failed songs again (all of them without an id). */
	retry(videoId?: string): number {
		const jobs = videoId ? [this.failedJobs.get(videoId)].filter((j): j is DownloadJob => !!j) : [...this.failedJobs.values()];
		for (const job of jobs) this.failedJobs.delete(job.videoId);
		// A failed downloader setup is tried again too.
		this.binaries = null;
		return this.add(jobs);
	}

	/** Forgets failed songs (all of them without an id). */
	dismiss(videoId?: string) {
		const ids = videoId ? [videoId] : [...this.failedJobs.keys()];
		for (const id of ids) {
			this.failedJobs.delete(id);
			if (this.statuses.get(id)?.state === "error") this.statuses.delete(id);
		}
		this.pushAll();
	}

	cancel(videoId: string) {
		const i = this.queue.findIndex((j) => j.videoId === videoId);
		if (i >= 0) this.queue.splice(i, 1);
		this.running.get(videoId)?.abort();
		this.statuses.delete(videoId);
		this.pushAll();
	}

	async remove(videoId: string) {
		const entry = this.index.get(videoId);
		if (!entry) return;
		await rm(entry.file, { force: true }).catch(() => undefined);
		if (entry.art) await rm(entry.art, { force: true }).catch(() => undefined);
		this.index.remove(videoId);
		this.statuses.delete(videoId);
		this.pushAll();
	}

	openFolder() {
		void mkdir(this.folderPath, { recursive: true }).then(() => shell.openPath(this.folderPath));
	}

	showInFolder(videoId: string) {
		const entry = this.index.get(videoId);
		if (entry && existsSync(entry.file)) shell.showItemInFolder(entry.file);
	}

	private setStatus(job: DownloadJob, state: DownloadState, percent: number, error?: string) {
		const status: DownloadStatus = { videoId: job.videoId, title: job.title, artist: job.artist, state, percent, error };
		this.statuses.set(job.videoId, status);
		serverMain.emit("downloads:status", status);
		YtmClient.push("downloads:status", status);
	}

	private pushAll() {
		const payload = { statuses: this.status(), downloaded: this.downloadedIds() };
		serverMain.emit("downloads:all", payload);
		YtmClient.push("downloads:all", payload);
	}

	private getBinaries() {
		this.binaries ??= ensureBinaries(this.binDir, { fetch: (input, init) => fetch(input, init) }).catch((err) => {
			this.binaries = null;
			throw err;
		});
		return this.binaries;
	}

	private pump() {
		while (this.running.size < CONCURRENCY && this.queue.length) {
			const job = this.queue.shift()!;
			const abort = new AbortController();
			this.running.set(job.videoId, abort);
			void this.run(job, abort.signal).finally(() => {
				this.running.delete(job.videoId);
				this.pump();
			});
		}
	}

	private async run(job: DownloadJob, signal: AbortSignal) {
		try {
			this.setStatus(job, "binaries", 0);
			const bins = await this.getBinaries();
			if (signal.aborted) return;
			this.setStatus(job, "downloading", 0);
			await mkdir(this.folderPath, { recursive: true });
			const youtubeSession = this.views?.youtubeView?.webContents?.session ?? null;
			const withId = await this.nameTaken(job);
			const file = await runDownload(
				job,
				{
					ytDlp: bins.ytDlp,
					ffmpeg: bins.ffmpeg,
					jsRuntime: `deno:${bins.deno}`,
					outDir: this.folderPath,
					tmpDir: path.join(this.userData, "tmp"),
					stampFile: path.join(this.binDir, ".last-update"),
					withId,
				},
				youtubeSession,
				(percent) => this.setStatus(job, "downloading", percent),
				signal,
			);
			const art = await this.saveArt(job).catch(() => undefined);
			this.failedJobs.delete(job.videoId);
			this.index.add({
				videoId: job.videoId,
				title: job.title,
				artist: job.artist,
				album: job.album,
				durationSec: job.durationSec,
				trackNumber: job.trackNumber,
				collection: job.collection,
				file,
				art,
				addedAt: Date.now(),
			});
			this.setStatus(job, "done", 100);
			this.pushAll();
		} catch (err) {
			if (signal.aborted) return;
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`download failed for ${job.videoId}: ${message}`);
			this.failedJobs.set(job.videoId, job);
			this.setStatus(job, "error", 0, message);
		}
	}

	/** Another song (or a file we don't know) already has this "Artist - Title" name, or is being downloaded under it. */
	private async nameTaken(job: DownloadJob): Promise<boolean> {
		const base = safeFileName(job.artist, job.title, "x").slice(0, -2).toLowerCase();
		const same = (file: string) => {
			const name = path.basename(file).toLowerCase();
			return name.startsWith(`${base}.`);
		};
		if (this.index.list().some((e) => e.videoId !== job.videoId && same(e.file))) return true;
		for (const [id, status] of this.statuses) {
			if (id !== job.videoId && this.running.has(id) && safeFileName(status.artist, status.title, "x").slice(0, -2).toLowerCase() === base) return true;
		}
		const files = await readdir(this.folderPath).catch(() => [] as string[]);
		return files.some((f) => same(f) && !f.toLowerCase().endsWith(".part"));
	}

	/** The cover for the Downloads page, kept next to the files so it shows offline. */
	private async saveArt(job: DownloadJob): Promise<string | undefined> {
		if (!job.artUrl || !isYoutubeImageUrl(job.artUrl)) return undefined;
		const res = await fetch(job.artUrl, { redirect: "error" });
		if (!res.ok) return undefined;
		const dir = path.join(this.folderPath, ART_DIR);
		await mkdir(dir, { recursive: true });
		const file = path.join(dir, safeFileName("", job.videoId, "jpg"));
		await writeFile(file, Buffer.from(await res.arrayBuffer()));
		return file;
	}
}
