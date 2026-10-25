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
		let saved: { muted: boolean; rate: number } | null = null;
		let video: HTMLVideoElement | null = null;

		const fallbackOn = () => cfg.enabled !== false && cfg.fallback !== false;
		const upsellOn = () => cfg.enabled !== false && cfg.hideUpsells !== false;

		const applyUpsell = () => {
			try {
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
				const player = observed;
				if (!player || !player.classList.contains(AD_CLASS) || !fallbackOn()) return endAd();
				const v = document.querySelector("video");
				if (!v) return;
				if (!saved) {
					video = v;
					saved = { muted: v.muted, rate: v.playbackRate };
				}
				v.muted = true;
				v.playbackRate = AD_RATE;
				const btn = Array.from(document.querySelectorAll<HTMLElement>(SKIP_SELECTOR)).find(isVisible);
				btn?.click();
			} catch (err) {
				ctx.log.error("ad skip step failed", err);
			}
		};

		function endAd() {
			try {
				if (pollTimer) clearInterval(pollTimer);
				pollTimer = null;
				if (saved) {
					const v = video ?? document.querySelector("video");
					if (v) {
						v.muted = saved.muted;
						v.playbackRate = saved.rate;
					}
					saved = null;
					video = null;
					ctx.ytmd?.emit(SKIPPED_EVENT);
				}
			} catch (err) {
				ctx.log.error("ad restore failed", err);
			}
		}

		const onClassChange = () => {
			try {
				const showing = !!observed?.classList.contains(AD_CLASS) && fallbackOn();
				if (showing && !pollTimer) {
					tickAd();
					pollTimer = setInterval(tickAd, POLL_MS);
				} else if (!showing) endAd();
			} catch (err) {
				ctx.log.error("ad-showing handler failed", err);
			}
		};

		const attach = () => {
			try {
				const player = document.getElementById("movie_player");
				if (!player || player === observed) return;
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
			if (attachTimer) clearInterval(attachTimer);
			offSettings?.();
			observer?.disconnect();
			endAd();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default adblockRenderer;
