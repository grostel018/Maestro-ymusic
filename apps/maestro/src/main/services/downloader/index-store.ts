// The list of downloaded songs (`userData/downloads.json`), so the Downloads page works with no network.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DownloadCollection } from "./core";

export type DownloadEntry = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
	/** Absolute path of the audio file. */
	file: string;
	art?: string;
	addedAt: number;
	trackNumber?: number;
	/** The album or playlist it came from; Downloads groups songs by it. */
	collection?: DownloadCollection;
};

export type DownloadIndex = {
	list(): DownloadEntry[];
	get(videoId: string): DownloadEntry | undefined;
	add(entry: DownloadEntry): void;
	remove(videoId: string): void;
	/** Drops entries whose file no longer exists. */
	prune(exists: (path: string) => boolean): void;
	has(videoId: string): boolean;
};

function read(file: string): DownloadEntry[] {
	try {
		if (!existsSync(file)) return [];
		const data = JSON.parse(readFileSync(file, "utf8"));
		return Array.isArray(data) ? data.filter((e) => e && typeof e.videoId === "string" && typeof e.file === "string") : [];
	} catch {
		return [];
	}
}

export function createIndex(file: string): DownloadIndex {
	let entries = read(file);
	const save = () => {
		mkdirSync(dirname(file), { recursive: true });
		const tmp = `${file}.tmp`;
		writeFileSync(tmp, JSON.stringify(entries, null, 1));
		renameSync(tmp, file);
	};
	return {
		list: () => entries.slice(),
		get: (videoId) => entries.find((e) => e.videoId === videoId),
		add(entry) {
			entries = [...entries.filter((e) => e.videoId !== entry.videoId), entry];
			save();
		},
		remove(videoId) {
			const next = entries.filter((e) => e.videoId !== videoId);
			if (next.length === entries.length) return;
			entries = next;
			save();
		},
		prune(exists) {
			const next = entries.filter((e) => exists(e.file));
			if (next.length === entries.length) return;
			entries = next;
			save();
		},
		has: (videoId) => entries.some((e) => e.videoId === videoId),
	};
}
