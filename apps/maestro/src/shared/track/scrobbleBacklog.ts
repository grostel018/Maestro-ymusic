// Last.fm plays that couldn't be sent (offline), kept until the connection is back. Last.fm accepts scrobbles up to
// 14 days old and at most 50 per batch.

export type ScrobbleEntry = { videoId: string; artist: string; title: string; album?: string; durationSec?: number; timestamp: number };

const MAX_AGE_S = 14 * 86_400;
const BATCH = 50;
const key = (e: ScrobbleEntry) => `${e.videoId}:${Math.floor(e.timestamp)}`;

function isEntry(v: unknown): v is ScrobbleEntry {
	const e = v as ScrobbleEntry;
	return !!e && typeof e === "object" && typeof e.videoId === "string" && typeof e.artist === "string" && typeof e.title === "string" && Number.isFinite(e.timestamp);
}

export class ScrobbleBacklog {
	private entries = new Map<string, ScrobbleEntry>();

	add(e: ScrobbleEntry): void {
		this.entries.set(key(e), e);
	}

	/** `now` in seconds. Oldest first, entries Last.fm would reject dropped. */
	due(now: number): ScrobbleEntry[] {
		for (const [k, e] of this.entries) if (now - e.timestamp > MAX_AGE_S) this.entries.delete(k);
		return [...this.entries.values()].sort((a, b) => a.timestamp - b.timestamp).slice(0, BATCH);
	}

	ack(sent: ScrobbleEntry[]): void {
		for (const e of sent) this.entries.delete(key(e));
	}

	get size(): number {
		return this.entries.size;
	}

	toJSON(): ScrobbleEntry[] {
		return [...this.entries.values()];
	}

	static from(json: unknown): ScrobbleBacklog {
		const b = new ScrobbleBacklog();
		if (Array.isArray(json)) for (const e of json) if (isEntry(e)) b.add(e);
		return b;
	}
}
