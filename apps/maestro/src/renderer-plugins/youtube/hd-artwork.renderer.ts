import { hdArt } from "@shared/track/thumbnail";
import type { RendererPluginRegistration } from "./world0/types";

// Sharp album art on the player page: YouTube Music loads the cover at 544 px and stretches it, which looks soft on a
// large or high-DPI window. Each time it sets the cover, the same image is asked for at 2048 px (Google's image CDN
// returns the original when smaller). Video thumbnails (i.ytimg.com) are left alone.

const COVER = "ytmusic-player #song-image img";

const hdArtworkRenderer: RendererPluginRegistration = {
	id: "hd-artwork",
	enabled: true,
	start() {
		let watched: HTMLImageElement | null = null;

		const upgrade = (img: HTMLImageElement) => {
			const src = img.getAttribute("src");
			if (!src) return;
			const hd = hdArt(src);
			if (hd !== src) img.setAttribute("src", hd);
		};
		const srcObserver = new MutationObserver(() => {
			if (watched) upgrade(watched);
		});

		/** Finds the cover (YTM recreates it with the player) and watches its `src`. */
		const attach = () => {
			const img = document.querySelector<HTMLImageElement>(COVER);
			if (!img || img === watched) return;
			srcObserver.disconnect();
			watched = img;
			srcObserver.observe(img, { attributes: true, attributeFilter: ["src"] });
			upgrade(img);
		};
		const interval = window.setInterval(() => {
			if (!document.hidden) attach();
		}, 2000);
		attach();

		return () => {
			window.clearInterval(interval);
			srcObserver.disconnect();
			watched = null;
		};
	},
};

export default hdArtworkRenderer;
