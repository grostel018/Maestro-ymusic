import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AfterInit, BaseProvider, OnDestroy } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { emitAppToast } from "@main/lib/appToast";
import { trackService } from "@main/trpc/routers/track";
import { YtmClient } from "@main/ytm/ytm-client";
import { isPlayable, MAX_IMPORT_TRACKS, mixSmart, type Playlist, type PlaylistTrack, parsePlaylistFile, shuffled } from "@shared/playlists/parse";
import { app } from "electron";
import { debounce } from "lodash-es";

const REQUEST_TIMEOUT_MS = 20_000;
/** Spacing between searches while matching an import: this is someone's own YouTube session. */
const SEARCH_GAP_MS = 400;
const SEARCH_FAILURES_BEFORE_PAUSE = 3;
/** How much smart shuffle queues up, and how many songs seed its recommendations. */
const SMART_OWN = 45;
const SMART_SEEDS = 3;
const SMART_MIN_RECS = 20;

type Reply = { id: string; ok: boolean; data?: unknown; error?: string };
type SearchHit = { videoId: string; title: string; artist: string; durationSec?: number } | null;

/**
 * Local playlists and smart shuffle (roadmap G7, G4): kept in userData/playlists.json, played through YouTube Music by
 * video id. The page does what needs YouTube's session (`playlists:cmd` / `playlists:reply`, see playlists.renderer.ts).
 */
export default class PlaylistsProvider extends BaseProvider implements AfterInit, OnDestroy {
	private playlists: Playlist[];
	private readonly save = debounce(() => void this.write(), 500);
	private readonly waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
	private matching = false;
	private wired = false;

	constructor() {
		super("playlists");
		this.playlists = this.read();
		serverMain.on("playlists:reply", (_ev, reply: Reply) => this.onReply(reply));
		serverMain.on("playlists:menu-request", () => YtmClient.push("playlists:menu", { playlists: this.playlists.map((p) => ({ id: p.id, name: p.name })) }));
		serverMain.on("playlists:action", (_ev, action: { type?: string; id?: string }) => void this.onAction(action));
	}

	private get file() {
		return path.join(app.getPath("userData"), "playlists.json");
	}

	private read(): Playlist[] {
		try {
			const raw = JSON.parse(readFileSync(this.file, "utf8")) as { playlists?: Playlist[] };
			return Array.isArray(raw.playlists) ? raw.playlists : [];
		} catch {
			return [];
		}
	}

	private async write(): Promise<void> {
		// Via a temporary file: a crash mid-write must not lose the playlists.
		const tmp = `${this.file}.tmp`;
		await writeFile(tmp, JSON.stringify({ playlists: this.playlists }), "utf8")
			.then(() => rename(tmp, this.file))
			.catch((err) => this.logger.warn("playlists not saved", err));
	}

	async AfterInit() {
		if (this.wired) return;
		this.wired = true;
		void this.matchPending();
	}

	async OnDestroy() {
		this.save.cancel();
		await this.write();
	}

	private request<T>(kind: string, data?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
		const id = randomUUID();
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				reject(new Error(`${kind} timed out`));
			}, timeoutMs);
			this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
			YtmClient.push("playlists:cmd", { id, kind, data });
		});
	}

	private onReply(reply: Reply) {
		const wait = reply?.id ? this.waiting.get(reply.id) : undefined;
		if (!wait) return;
		this.waiting.delete(reply.id);
		clearTimeout(wait.timer);
		if (reply.ok) wait.resolve(reply.data);
		else wait.reject(new Error(reply.error || "page command failed"));
	}

	private toast(type: "success" | "error" | "info", message: string) {
		emitAppToast(this.windowContext, { type, message });
	}

	private byId(id: string): Playlist {
		const p = this.playlists.find((x) => x.id === id);
		if (!p) throw new Error("That playlist no longer exists.");
		return p;
	}

	list() {
		return this.playlists.map((p) => ({ id: p.id, name: p.name, tracks: p.tracks, found: p.tracks.filter(isPlayable).length }));
	}

	get isMatching() {
		return this.matching;
	}

	create(name: string): string {
		const p: Playlist = { id: randomUUID(), name: name.trim().slice(0, 100) || `Playlist ${this.playlists.length + 1}`, tracks: [], createdAt: Date.now() };
		this.playlists.push(p);
		this.save();
		return p.id;
	}

	rename(id: string, name: string) {
		const clean = name.trim().slice(0, 100);
		if (clean) this.byId(id).name = clean;
		this.save();
	}

	remove(id: string) {
		this.playlists = this.playlists.filter((p) => p.id !== id);
		this.save();
	}

	removeTrack(id: string, index: number) {
		this.byId(id).tracks.splice(index, 1);
		this.save();
	}

	/** Adds the playing song; false when it's already there or nothing plays. */
	addCurrent(id: string): boolean {
		const t = trackService.trackData;
		const videoId = t?.video?.videoId;
		if (!videoId) return false;
		const p = this.byId(id);
		if (p.tracks.some((x) => x.videoId === videoId)) return false;
		p.tracks.push({ videoId, title: t.video.title ?? "", artist: t.video.author ?? "", ...(t.meta?.duration ? { durationSec: Number(t.meta.duration) } : {}) });
		this.save();
		return true;
	}

	/** The current queue as a new playlist. */
	async saveQueue(name: string): Promise<string> {
		const rows = await this.request<{ videoId?: string; title?: string; artist?: string; durationSec?: number }[]>("queue");
		const tracks: PlaylistTrack[] = rows.flatMap((r) => (r.videoId ? [{ videoId: r.videoId, title: r.title ?? "", artist: r.artist ?? "", ...(r.durationSec ? { durationSec: r.durationSec } : {}) }] : []));
		if (!tracks.length) throw new Error("The queue is empty.");
		const id = this.create(name);
		this.byId(id).tracks = tracks;
		this.save();
		return id;
	}

	/** Reads a file into one new playlist per list in it, then matches songs without a video id in the background. */
	importFile(fileName: string, text: string): { names: string[]; tracks: number } {
		const lists = parsePlaylistFile(fileName, text);
		if (!lists.length) throw new Error("No songs found in that file. It can be a CSV, M3U, a list of links, or a Spotify data export.");
		for (const list of lists) {
			const id = this.create(list.name);
			this.byId(id).tracks = list.tracks.slice(0, MAX_IMPORT_TRACKS);
		}
		this.save();
		void this.matchPending();
		return { names: lists.map((l) => l.name), tracks: lists.reduce((n, l) => n + l.tracks.length, 0) };
	}

	/** One search at a time, slowly; a page that stops answering pauses it until the next import or launch. */
	private async matchPending() {
		if (this.matching) return;
		this.matching = true;
		let failures = 0;
		try {
			for (const p of this.playlists) {
				for (const t of p.tracks) {
					if (t.videoId || t.notFound || !t.title) continue;
					try {
						const hit = await this.request<SearchHit>("search", { title: t.title, artist: t.artist, durationSec: t.durationSec ?? 0 });
						failures = 0;
						if (hit) {
							t.videoId = hit.videoId;
							if (!t.durationSec && hit.durationSec) t.durationSec = hit.durationSec;
						} else t.notFound = true;
						this.save();
					} catch (err) {
						if (++failures >= SEARCH_FAILURES_BEFORE_PAUSE) {
							this.logger.warn("playlist matching paused", err);
							return;
						}
					}
					await new Promise((r) => setTimeout(r, SEARCH_GAP_MS));
				}
			}
		} finally {
			this.matching = false;
		}
	}

	async play(id: string, opts: { shuffle?: boolean } = {}) {
		const p = this.byId(id);
		const ids = p.tracks.flatMap((t) => (t.videoId ? [t.videoId] : []));
		if (!ids.length) throw new Error(p.tracks.length ? "None of these songs were found on YouTube Music yet." : "This playlist is empty.");
		await this.request("play", { videoIds: opts.shuffle ? shuffled(ids) : ids }, 60_000);
	}

	/** Your liked songs, top songs and playlists, shuffled, with a recommendation after every third song. */
	async smartShuffle() {
		const liked = await this.request<string[]>("liked").catch(() => [] as string[]);
		const top = this.getProvider("stats")
			.summary()
			.topTracks.map((t) => t.videoId);
		const saved = this.playlists.flatMap((p) => p.tracks.flatMap((t) => (t.videoId ? [t.videoId] : [])));
		const current = trackService.trackData?.video?.videoId;
		const pool = shuffled([...new Set([...liked, ...top, ...saved, ...(current ? [current] : [])])]);
		if (!pool.length) throw new Error("Play or like a few songs first: smart shuffle mixes those with recommendations.");
		const own = pool.slice(0, SMART_OWN);
		const lists = await Promise.all(own.slice(0, SMART_SEEDS).map((seed) => this.request<string[]>("radio", { videoId: seed }).catch(() => [] as string[])));
		// Round robin, so one seed's radio doesn't dominate.
		const longest = Math.max(0, ...lists.map((l) => l.length));
		const recs = Array.from({ length: longest }, (_, i) => lists.flatMap((l) => (l[i] ? [l[i]] : []))).flat();
		// One per three of yours, and enough to play for a while when you have few songs of your own.
		const order = mixSmart(own, recs.slice(0, Math.max(SMART_MIN_RECS, Math.ceil(own.length / 3))));
		await this.request("play", { videoIds: order }, 60_000);
		return { own: own.length, recommended: order.length - own.length };
	}

	private async onAction(action: { type?: string; id?: string }) {
		try {
			if (action?.type === "smart") {
				this.toast("info", "Starting smart shuffle…");
				await this.smartShuffle();
			} else if (action?.type === "add-new") {
				const id = this.create("");
				this.addCurrent(id);
				this.toast("success", `Added to ${this.byId(id).name}`);
			} else if (action?.type === "add" && action.id) {
				const added = this.addCurrent(action.id);
				this.toast(added ? "success" : "info", added ? `Added to ${this.byId(action.id).name}` : `Already in ${this.byId(action.id).name}`);
			}
		} catch (err) {
			this.toast("error", err instanceof Error ? err.message : "That didn't work.");
		}
	}
}
