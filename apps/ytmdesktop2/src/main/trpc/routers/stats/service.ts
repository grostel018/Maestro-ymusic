import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseProvider, OnDestroy } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { app } from "electron";
import { debounce } from "lodash-es";

/** A play counts once a track was listened to this long. */
const PLAY_AFTER_SEC = 30;

type TrackStat = { title: string; artist: string; sec: number; plays: number };
type StatsFile = { since: string; totalSec: number; tracks: Record<string, TrackStat>; artists: Record<string, number>; years: Record<string, number> };
export type Listen = { videoId: string; title: string; artist: string; seconds: number };
export type StatsSummary = {
	since: string;
	totalHours: number;
	yearHours: number;
	year: number;
	topTracks: Array<{ videoId: string; title: string; artist: string; minutes: number; plays: number }>;
	topArtists: Array<{ artist: string; minutes: number }>;
};

/**
 * Listening stats (roadmap G3): the page reports seconds actually played (`stats:listen`); this adds them up per
 * track, artist and year in userData/listening-stats.json (written at most once a minute and on quit). Nothing
 * leaves the machine.
 */
export default class StatsProvider extends BaseProvider implements OnDestroy {
	private data: StatsFile;
	/** Seconds per track in the current listen, so a play counts once per listen. */
	private current: { videoId: string; sec: number; counted: boolean } | null = null;
	private readonly save = debounce(() => void this.write(), 60_000, { maxWait: 60_000 });

	constructor() {
		super("stats");
		this.data = this.read();
		serverMain.on("stats:listen", (_ev, listen: Listen) => this.add(listen));
	}

	private get file() {
		return path.join(app.getPath("userData"), "listening-stats.json");
	}

	private read(): StatsFile {
		try {
			const raw = JSON.parse(readFileSync(this.file, "utf8")) as Partial<StatsFile>;
			return { since: raw.since ?? new Date().toISOString(), totalSec: raw.totalSec ?? 0, tracks: raw.tracks ?? {}, artists: raw.artists ?? {}, years: raw.years ?? {} };
		} catch {
			return { since: new Date().toISOString(), totalSec: 0, tracks: {}, artists: {}, years: {} };
		}
	}

	private async write(): Promise<void> {
		await mkdir(path.dirname(this.file), { recursive: true }).catch(() => undefined);
		// Via a temporary file: a crash or power cut mid-write must not lose the listening history.
		const tmp = `${this.file}.tmp`;
		await writeFile(tmp, JSON.stringify(this.data), "utf8")
			.then(() => rename(tmp, this.file))
			.catch((err) => this.logger.warn("stats not saved", err));
	}

	private add(l: Listen): void {
		if (!l?.videoId || !l.title || !(l.seconds > 0) || l.seconds > 120) return;
		const rawArtist = l.artist ?? "";
		const t = (this.data.tracks[l.videoId] ??= { title: l.title, artist: rawArtist, sec: 0, plays: 0 });
		t.title = l.title;
		t.artist = rawArtist;
		t.sec += l.seconds;
		if (this.current?.videoId !== l.videoId) this.current = { videoId: l.videoId, sec: 0, counted: false };
		this.current.sec += l.seconds;
		if (!this.current.counted && this.current.sec >= PLAY_AFTER_SEC) {
			this.current.counted = true;
			t.plays += 1;
		}
		const artist = rawArtist.replace(/\s+-\s+Topic$/i, "").trim() || "Unknown";
		this.data.artists[artist] = (this.data.artists[artist] ?? 0) + l.seconds;
		const year = String(new Date().getFullYear());
		this.data.years[year] = (this.data.years[year] ?? 0) + l.seconds;
		this.data.totalSec += l.seconds;
		this.save();
	}

	summary(): StatsSummary {
		const year = new Date().getFullYear();
		const topTracks = Object.entries(this.data.tracks)
			.sort((a, b) => b[1].sec - a[1].sec)
			.slice(0, 10)
			.map(([videoId, t]) => ({ videoId, title: t.title, artist: t.artist, minutes: Math.round(t.sec / 60), plays: t.plays }));
		const topArtists = Object.entries(this.data.artists)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([artist, sec]) => ({ artist, minutes: Math.round(sec / 60) }));
		const hours = (sec: number) => Math.round((sec / 3600) * 10) / 10;
		return { since: this.data.since, totalHours: hours(this.data.totalSec), yearHours: hours(this.data.years[String(year)] ?? 0), year, topTracks, topArtists };
	}

	reset(): void {
		this.data = { since: new Date().toISOString(), totalSec: 0, tracks: {}, artists: {}, years: {} };
		this.current = null;
		void this.write();
	}

	async OnDestroy() {
		this.save.cancel();
		await this.write();
	}
}
