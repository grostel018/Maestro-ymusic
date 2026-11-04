import os from "node:os";
import { AfterInit, BaseProvider, OnDestroy } from "@main/core/baseProvider";
import { getAppWindows } from "@main/lifecycle";
import { app, type BrowserWindow } from "electron";

/** How long another app must stay in front before the app steps back (a quick alt-tab doesn't count). */
const BACKGROUND_AFTER_MS = 3000;

export type GameModeLevel = "active" | "background" | "hidden";

/**
 * Game mode: while another app (a game) is in front, the app gives way.
 * - background (window not focused for 3 s): GPU, UI and helper processes run at below-normal priority, so a game
 *   wins CPU and GPU time when both want it. The YouTube Music renderer and the audio service keep normal priority,
 *   so the music never stutters.
 * - hidden (minimized or in the tray): also frees Blink's in-memory caches. It leaves the video quality alone: a live
 *   quality change makes YouTube rebuffer, a gap of about 1.4 s in the music (s9).
 * Setting `app.gameMode` (default on). Nothing changes while the window is focused.
 */
export default class GameModeProvider extends BaseProvider implements AfterInit, OnDestroy {
	private level: GameModeLevel = "active";
	private timer: ReturnType<typeof setTimeout> | null = null;
	private lowered = new Set<number>();
	private bound: BrowserWindow | null = null;

	constructor() {
		super("gameMode");
	}

	private get enabled(): boolean {
		return (this.getProvider("settings").get("app.gameMode", true) as unknown) !== false;
	}

	getLevel(): GameModeLevel {
		return this.level;
	}

	AfterInit() {
		// The main window may come after the providers; bind once it exists.
		const tryBind = () => {
			this.bind();
			if (!this.bound) setTimeout(tryBind, 2000);
		};
		tryBind();
		this.getProvider("settings").onSettingChange?.("app.gameMode", () => this.evaluate());
	}

	private bind(): void {
		const win = getAppWindows()?.main;
		if (!win || win === this.bound) return;
		this.bound = win;
		const later = () => {
			if (this.timer) clearTimeout(this.timer);
			this.timer = setTimeout(() => this.evaluate(), BACKGROUND_AFTER_MS);
		};
		const now = () => {
			if (this.timer) clearTimeout(this.timer);
			this.evaluate();
		};
		win.on("blur", later);
		win.on("focus", now);
		win.on("minimize", now);
		win.on("hide", now);
		win.on("restore", now);
		win.on("show", now);
	}

	private wanted(): GameModeLevel {
		const win = this.bound;
		if (!this.enabled || !win || win.isDestroyed()) return "active";
		if (win.isMinimized() || !win.isVisible()) return "hidden";
		if (!win.isFocused()) return "background";
		return "active";
	}

	private evaluate(): void {
		const next = this.wanted();
		if (next === this.level) return;
		const prev = this.level;
		this.level = next;
		this.logger.debug(`game mode ${prev} -> ${next}`);
		if (next === "active") this.restorePriorities();
		else this.lowerPriorities();
		if (next === "hidden") this.freePageCaches();
	}

	/** Processes that may give way: everything except the YouTube Music renderer and the audio service. */
	private yieldingPids(): number[] {
		let musicPid = -1;
		try {
			musicPid = getAppWindows()?.views?.youtubeView?.webContents?.getOSProcessId() ?? -1;
		} catch {
			/* no view yet */
		}
		return app
			.getAppMetrics()
			.filter((m) => m.pid !== musicPid && !(m.type === "Utility" && /audio/i.test(m.serviceName ?? m.name ?? "")))
			.map((m) => m.pid);
	}

	private lowerPriorities(): void {
		for (const pid of this.yieldingPids()) {
			if (this.lowered.has(pid)) continue;
			try {
				os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
				this.lowered.add(pid);
			} catch {
				/* the process may have exited */
			}
		}
	}

	private restorePriorities(): void {
		for (const pid of this.lowered) {
			try {
				os.setPriority(pid, os.constants.priority.PRIORITY_NORMAL);
			} catch {
				/* gone */
			}
		}
		this.lowered.clear();
	}

	private freePageCaches(): void {
		const wc = getAppWindows()?.views?.youtubeView?.webContents;
		if (!wc || wc.isDestroyed()) return;
		wc.send("ytmd:game-mode-hidden");
	}

	OnDestroy() {
		if (this.timer) clearTimeout(this.timer);
		this.restorePriorities();
	}
}
