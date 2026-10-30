import { createHash } from "node:crypto";
import { BaseProvider } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { YtmClient } from "@main/ytm/ytm-client";
import { type Segment, segmentsFor } from "@shared/sponsorblock";
import { net } from "electron";

const API = "https://sponsor.ajay.app/api/skipSegments";
/** Non-music parts of music videos, sponsor reads and self-promotion. */
const CATEGORIES = ["music_offtopic", "sponsor", "selfpromo"];
const TIMEOUT_MS = 8000;

/**
 * SponsorBlock for music videos (roadmap G5), through its privacy endpoint: only the first 4 hex digits of the
 * video id's SHA-256 leave the machine, never the id. Asked by the page (`sponsorblock:request`), answered with a
 * push (`sponsorblock:segments`). Segments are kept in memory for the session.
 */
export default class SponsorBlockProvider extends BaseProvider {
	private cache = new Map<string, Segment[]>();

	constructor() {
		super("sponsorblock");
		serverMain.on("sponsorblock:request", (_ev, videoId: unknown) => {
			if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId)) void this.answer(videoId);
		});
	}

	private async answer(videoId: string): Promise<void> {
		let segments = this.cache.get(videoId);
		if (!segments) {
			segments = await this.fetch(videoId).catch((err) => {
				this.logger.debug("sponsorblock lookup failed", err);
				return [];
			});
			this.cache.set(videoId, segments);
		}
		YtmClient.push("sponsorblock:segments", { videoId, segments });
	}

	private async fetch(videoId: string): Promise<Segment[]> {
		const prefix = createHash("sha256").update(videoId).digest("hex").slice(0, 4);
		const url = `${API}/${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`;
		const res = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		// 404: no segments for any video with this prefix.
		if (res.status === 404) return [];
		if (!res.ok) throw new Error(`SponsorBlock ${res.status}`);
		return segmentsFor(await res.json(), videoId);
	}
}
