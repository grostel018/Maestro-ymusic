import type { RendererPluginContext, RendererPluginRegistration } from "./world0/types";

const STYLE_ID = "ytmd-adblock-upsell";
const SKIPPED_EVENT = "adblock:skipped";
const AD_CLASS = "ad-showing";
const POLL_MS = 250;
const AD_RATE = 16;
const SKIP_SELECTOR = ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
const UPSELL_CSS = [
	"ytmusic-mealbar-promo-renderer",
	"ytmusic-enforcement-message-view-model",
	"tp-yt-paper-dialog:has(ytmusic-mealbar-promo-renderer)",
	"ytmusic-statement-banner-renderer",
].join(",\n") + " { display: none !important; }";

type AdblockSettings = { enabled?: boolean; fallback?: boolean; hideUpsells?: boolean };

function isVisible(el: Element): boolean {
	const r = (el as HTMLElement).getBoundingClientRect();
	return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

/**
 * Page-world third layer of the ad blocker: when `#movie_player` gets `ad-showing` the ad is muted, sped up and
 * its skip button clicked; upsell elements are hidden by CSS. Every step is guarded: a failure never touches playback.
 */
const adblockRenderer: RendererPluginRegistration = {
	id: "adblock",
	enabled: true,
	start(ctx: RendererPluginContext) {
		let cfg: AdblockSettings = {};
		let observer: MutationObserver | null = null;
		let observed: Element | null = null;
		let attachTimer: ReturnType<typeof setInterval> | null = null;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		/** Pre-ad state of every <video> touched during the current ad (YTM may swap the element mid-ad). */
		const saved = new Map<HTMLVideoElement, { muted: boolean; rate: number }>();
		let adActive = false;
		let stopped = false;

		const fallbackOn = () => cfg.enabled !== false && cfg.fallback !== false;
		const upsellOn = () => cfg.enabled !== false && cfg.hideUpsells !== false;

		const applyUpsell = () => {
			try {
				if (stopped) return;
				const existing = document.getElementById(STYLE_ID);
				if (upsellOn()) {
					if (existing) return;
					const style = document.createElement("style");
					style.id = STYLE_ID;
					style.textContent = UPSELL_CSS;
					(document.head ?? document.documentElement).appendChild(style);
				} else existing?.remove();
			} catch (err) {
				ctx.log.error("upsell css failed", err);
			}
		};

		const tickAd = () => {
			try {
				if (stopped) return;
				const player = observed;
				if (!player || !player.isConnected || !player.classList.contains(AD_CLASS) || !fallbackOn()) return onClassChange();
				const v = document.querySelector("video");
				if (!v) return;
				if (!saved.has(v)) saved.set(v, { muted: v.muted, rate: v.playbackRate });
				adActive = true;
				v.muted = true;
				v.playbackRate = AD_RATE;
				const btn = Array.from(document.querySelectorAll<HTMLElement>(SKIP_SELECTOR)).find(isVisible);
				btn?.click();
			} catch (err) {
				ctx.log.error("ad skip step failed", err);
			}
		};

		/** Restores every touched <video>. `ended` is false when the fallback was switched off mid-ad. */
		function endAd(ended: boolean) {
			try {
				if (pollTimer) clearInterval(pollTimer);
				pollTimer = null;
				for (const [v, st] of saved) {
					try {
						v.muted = st.muted;
						v.playbackRate = st.rate;
					} catch (err) {
						ctx.log.error("ad restore failed", err);
					}
				}
				saved.clear();
				if (adActive && ended) ctx.ytmd?.emit(SKIPPED_EVENT);
				adActive = false;
			} catch (err) {
				ctx.log.error("ad restore failed", err);
			}
		}

		function onClassChange() {
			try {
				if (stopped) return;
				const adOn = !!observed?.isConnected && observed.classList.contains(AD_CLASS);
				if (adOn && fallbackOn()) {
					if (!pollTimer) {
						pollTimer = setInterval(tickAd, POLL_MS);
						tickAd();
					}
				} else if (pollTimer || saved.size) endAd(!adOn);
			} catch (err) {
				ctx.log.error("ad-showing handler failed", err);
			}
		}

		const attach = () => {
			try {
				if (stopped) return;
				const player = document.getElementById("movie_player");
				if (!player || player === observed) return;
				if (observed) endAd(true);
				observer?.disconnect();
				observed = player;
				observer = new MutationObserver(onClassChange);
				observer.observe(player, { attributes: true, attributeFilter: ["class"] });
				onClassChange();
			} catch (err) {
				ctx.log.error("player observer failed", err);
			}
		};

		const load = async () => {
			try {
				const v = await ctx.ytmd?.settings.get("adblock");
				if (v && typeof v === "object") cfg = v as AdblockSettings;
			} catch (err) {
				ctx.log.error("adblock settings read failed", err);
			}
			if (stopped) return;
			applyUpsell();
			onClassChange();
		};

		void load();
		attach();
		// #movie_player is created late and replaced on some navigations
		attachTimer = setInterval(attach, 1000);

		const offSettings = ctx.ytmd?.on("settingsProvider.change", (key, value) => {
			const k = String(key);
			if (k === "adblock" && value && typeof value === "object") cfg = value as AdblockSettings;
			else if (k.startsWith("adblock.")) cfg = { ...cfg, [k.slice("adblock.".length)]: value };
			else return;
			applyUpsell();
			onClassChange();
		});

		return () => {
			stopped = true;
			if (attachTimer) clearInterval(attachTimer);
			offSettings?.();
			observer?.disconnect();
			observer = null;
			endAd(true);
			observed = null;
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default adblockRenderer;
