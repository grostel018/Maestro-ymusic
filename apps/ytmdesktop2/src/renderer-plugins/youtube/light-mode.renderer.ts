import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// Light mode for game mode (main/trpc/routers/gameMode/service.ts): while the window is minimized or in the tray,
// Video mode decodes the picture at 144p, so a game keeps the GPU. YouTube stores every quality change as the user's
// preference, so the stored one is put back with the quality when the window returns.

declare global {
	interface Window {
		__ytmdLight?: (on: boolean) => void;
	}
}

const Q_KEY = "yt-player-quality";
const AUDIO_VIEW = "ytmd-audio-view";

type QualityPlayer = { getPlaybackQuality?: () => string; setPlaybackQualityRange?: (min: string, max?: string) => void };

const lightModeRenderer: RendererPluginRegistration = {
	id: "light-mode",
	enabled: true,
	start(ctx) {
		let saved: { quality: string; stored: string | null } | null = null;

		window.__ytmdLight = (on: boolean) => {
			const p = getPagePlayerApi() as QualityPlayer | null;
			if (!p?.setPlaybackQualityRange || !p.getPlaybackQuality) return;
			try {
				if (on) {
					if (saved || document.documentElement.classList.contains(AUDIO_VIEW)) return;
					saved = { quality: p.getPlaybackQuality(), stored: localStorage.getItem(Q_KEY) };
					p.setPlaybackQualityRange("tiny", "tiny");
					return;
				}
				if (!saved) return;
				const { quality, stored } = saved;
				saved = null;
				// A stored preference means the user picked a level; otherwise YouTube was on Auto.
				if (stored) p.setPlaybackQualityRange(quality, quality);
				else p.setPlaybackQualityRange("auto", "auto");
				// Setting a range rewrites the stored preference; put the user's back.
				if (stored == null) localStorage.removeItem(Q_KEY);
				else localStorage.setItem(Q_KEY, stored);
			} catch (err) {
				ctx.log.warn("light mode", err);
			}
		};

		return () => {
			window.__ytmdLight?.(false);
			delete window.__ytmdLight;
		};
	},
};

export default lightModeRenderer;
