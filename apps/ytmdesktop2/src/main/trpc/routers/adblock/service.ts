import path from "node:path";
import type { ElectronBlocker } from "@ghostery/adblocker-electron";
import { BaseProvider, OnDestroy } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { app, net, type Session } from "electron";
import { debounce } from "lodash-es";
import { loadEngine } from "./engine";

const RETRY_MS = 60 * 60 * 1000;
const PERSIST_MS = 10_000;
const FETCH_TIMEOUT_MS = 30_000;
/** Page event from the fallback skipper: one handled ad. */
const SKIPPED_EVENT = "adblock:skipped";
const TOGGLE_KEYS = ["adblock", "adblock.enabled", "adblock.network"];

/**
 * Network layer of the ad blocker: Ghostery's ads-and-tracking engine on the YouTube session.
 * A failure here never stops startup or playback — it is logged and requests pass through.
 */
export default class AdblockProvider extends BaseProvider implements OnDestroy {
	private blocker: ElectronBlocker | null = null;
	private loading: Promise<void> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly sessions = new Set<Session>();
	private readonly blockingIn = new Set<Session>();
	private watching = false;
	private sessionBlocked = 0;
	private totalAtStart = 0;
	private readonly persistTotal = debounce(() => this.writeTotal(), PERSIST_MS, { maxWait: PERSIST_MS });

	constructor() {
		super("adblock");
		serverMain.on(SKIPPED_EVENT, () => this.onBlocked());
	}

	private get settings() {
		return this.getProvider("settings");
	}

	private wanted(): boolean {
		return !!(this.settings.get("adblock.enabled", true) && this.settings.get("adblock.network", true));
	}

	/**
	 * Blocks in `ses` once the engine is ready. Resolves after at most `timeoutMs`; a late engine attaches
	 * when it arrives. Never rejects.
	 */
	async attach(ses: Session, o: { timeoutMs: number }): Promise<void> {
		try {
			this.sessions.add(ses);
			if (!this.watching) {
				this.watching = true;
				this.totalAtStart = Number(this.settings.get("adblock.stats.total", 0)) || 0;
				this.settings.onSettingChange(TOGGLE_KEYS, () => void this.refresh());
			}
			if (!this.wanted()) return;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const capped = new Promise<"timeout">((r) => {
				timer = setTimeout(() => r("timeout"), o.timeoutMs);
			});
			const outcome = await Promise.race([this.refresh().then(() => "ready" as const), capped]);
			clearTimeout(timer);
			if (outcome === "timeout") this.logger.warn(`ad-block engine not ready after ${o.timeoutMs} ms; continuing, it attaches when ready`);
		} catch (e) {
			this.logger.error("ad-block attach failed", e);
		}
	}

	stats(): { session: number; total: number } {
		return { session: this.sessionBlocked, total: this.totalAtStart + this.sessionBlocked };
	}

	/** Loads the engine if blocking is wanted, then enables or disables it in every attached session. */
	private async refresh(): Promise<void> {
		try {
			if (this.wanted() && !this.blocker) await this.ensureEngine();
			this.apply();
		} catch (e) {
			this.logger.error("ad-block refresh failed", e);
		}
	}

	private ensureEngine(): Promise<void> {
		if (this.blocker) return Promise.resolve();
		this.loading ??= loadEngine({
			cachePath: path.join(app.getPath("userData"), "adblock", "engine.bin"),
			fetchImpl: ((input: string, init?: RequestInit) => net.fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })) as typeof fetch,
		}).then((blocker) => {
			this.loading = null;
			if (!blocker) {
				this.scheduleRetry();
				return;
			}
			this.blocker = blocker;
			blocker.on("request-blocked", () => this.onBlocked());
			this.logger.debug("ad-block engine ready");
		});
		return this.loading;
	}

	private scheduleRetry() {
		if (this.retryTimer) return;
		this.logger.warn(`ad-block engine unavailable; retrying in ${RETRY_MS / 60000} min`);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			void this.refresh();
		}, RETRY_MS);
		this.retryTimer.unref?.();
	}

	private apply() {
		const blocker = this.blocker;
		if (!blocker) return;
		const on = this.wanted();
		for (const ses of this.sessions) {
			try {
				if (on && !this.blockingIn.has(ses)) {
					blocker.enableBlockingInSession(ses);
					this.blockingIn.add(ses);
					this.logger.debug("ad-block network blocking enabled");
				} else if (!on && this.blockingIn.has(ses)) {
					blocker.disableBlockingInSession(ses);
					this.blockingIn.delete(ses);
					this.logger.debug("ad-block network blocking disabled");
				}
			} catch (e) {
				this.logger.error("ad-block enable/disable failed", e);
			}
		}
	}

	private onBlocked() {
		this.sessionBlocked++;
		this.persistTotal();
	}

	private writeTotal() {
		try {
			this.settings.set("adblock.stats.total", this.totalAtStart + this.sessionBlocked);
		} catch (e) {
			this.logger.error("ad-block stats write failed", e);
		}
	}

	OnDestroy() {
		this.persistTotal.flush();
		if (this.retryTimer) clearTimeout(this.retryTimer);
	}
}
