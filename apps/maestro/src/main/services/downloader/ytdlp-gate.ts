// yt-dlp replaces its own exe when it updates (`yt-dlp -U`), which fails or breaks a run while a download uses it.
// The gate lets downloads run together, but an update waits for them to finish and new downloads wait for the update.

export class YtDlpGate {
	private users = 0;
	private updating: Promise<void> | null = null;
	private idle: (() => void)[] = [];

	/** Runs `fn` (a yt-dlp download) once no update is running. */
	async use<T>(fn: () => Promise<T>): Promise<T> {
		while (this.updating) await this.updating;
		this.users++;
		try {
			return await fn();
		} finally {
			this.users--;
			if (this.users === 0) for (const wake of this.idle.splice(0)) wake();
		}
	}

	/** Runs `fn` (an update) when no download is using yt-dlp; one at a time. Never rejects. */
	async update(fn: () => Promise<void>): Promise<void> {
		while (this.updating) await this.updating;
		const run = (async () => {
			while (this.users > 0) await new Promise<void>((r) => this.idle.push(r));
			await fn().catch(() => undefined);
		})();
		this.updating = run;
		try {
			await run;
		} finally {
			if (this.updating === run) this.updating = null;
		}
	}
}

/** The one gate for this app's yt-dlp. */
export const ytDlpGate = new YtDlpGate();
