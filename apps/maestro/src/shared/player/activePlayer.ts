// Which player integrations follow (offline player parity spec): the YouTube Music page or the offline player.
// The one that last started playing is active. A report from the player that just lost, already in flight when the
// switch happened, must not flip it back (SWITCH_GRACE_MS).

export const SWITCH_GRACE_MS = 1500;

export class ActivePlayer {
	current: "online" | "offline" = "online";
	private switchedAt = Number.NEGATIVE_INFINITY;
	/** The online song that was showing when the offline player took over. */
	private onlineTrackId: string | null = null;
	/** Set when the page takes back over: the online song to show again if the page sends nothing new. */
	lastReleasedOnlineTrackId: string | null = null;

	/** The offline player reported; true when it takes over now. */
	offline(playing: boolean, now: number, onlineTrackId: string | null): boolean {
		if (this.current === "offline" || !playing || now - this.switchedAt < SWITCH_GRACE_MS) return false;
		this.current = "offline";
		this.switchedAt = now;
		this.onlineTrackId = onlineTrackId;
		return true;
	}

	/** The YouTube Music page reported a play state. */
	page(isPlaying: boolean, now: number): "apply" | "ignore" | "takeover" {
		if (this.current === "online") return "apply";
		if (!isPlaying || now - this.switchedAt < SWITCH_GRACE_MS) return "ignore";
		this.release(now);
		return "takeover";
	}

	/** Downloads closed: the page is active again at once (nothing else can play). */
	downloadsClosed(now = Date.now()): { released: boolean; onlineTrackId: string | null } {
		if (this.current === "online") return { released: false, onlineTrackId: null };
		this.release(now);
		return { released: true, onlineTrackId: this.lastReleasedOnlineTrackId };
	}

	private release(now: number) {
		this.current = "online";
		this.switchedAt = now;
		this.lastReleasedOnlineTrackId = this.onlineTrackId;
		this.onlineTrackId = null;
	}
}
