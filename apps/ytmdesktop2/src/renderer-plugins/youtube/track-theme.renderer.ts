import { makeBlurredArtwork } from "@shared/artwork/blur";
import type { RendererPluginRegistration } from "./world0/types";

const THUMB_STYLE_ID = "ytmd-track-theme-thumbnail";
const ACCENT_STYLE_ID = "ytmd-track-theme-accent";
const BLUR_STYLE_ID = "ytmd-track-theme-thumbnail-blur";

/** Pulls the address out of main's `url(...)` value. */
function thumbnailAddress(value: string): string | null {
	const m = /^url\(\s*["']?(.*?)["']?\s*\)$/.exec(value.trim());
	return m?.[1] || null;
}

function setRootStyle(id: string, cssText: string | null): void {
	const existing = document.getElementById(id);
	if (!cssText) {
		existing?.remove();
		return;
	}
	let el = existing as HTMLStyleElement | null;
	if (!el) {
		el = document.createElement("style");
		el.id = id;
		(document.head ?? document.documentElement).appendChild(el);
	}
	el.textContent = cssText;
}

/** Apply main-pushed thumbnail CSS vars in page world (ytmd push allowlist). */
const trackThemeRenderer: RendererPluginRegistration = {
	id: "track-theme",
	enabled: true,
	start(ctx) {
		let thumbnailSeq = 0;
		const handleThumbnail = (value: unknown) => {
			const seq = ++thumbnailSeq;
			if (!value || typeof value !== "string") {
				setRootStyle(THUMB_STYLE_ID, null);
				setRootStyle(BLUR_STYLE_ID, null);
				return;
			}
			setRootStyle(THUMB_STYLE_ID, `:root { --ytmd-thumbnail-url: ${value}; }`);
			const address = thumbnailAddress(value);
			if (!address) {
				setRootStyle(BLUR_STYLE_ID, null);
				return;
			}
			// The previous blurred artwork stays until the new one is ready; on failure the CSS falls back to the full image.
			makeBlurredArtwork(address).then(
				(dataUrl) => {
					if (seq === thumbnailSeq) setRootStyle(BLUR_STYLE_ID, `:root { --ytmd-thumbnail-blur-url: url("${dataUrl}"); }`);
				},
				() => {
					if (seq === thumbnailSeq) setRootStyle(BLUR_STYLE_ID, null);
				},
			);
		};

		const handleAccent = (value: unknown) => {
			if (!value || typeof value !== "string") {
				setRootStyle(ACCENT_STYLE_ID, null);
				return;
			}
			setRootStyle(ACCENT_STYLE_ID, `:root { --ytmd-thumbnail-accent: ${value}; }`);
		};

		const unsubThumb = ctx.ytmd?.on("css.thumbnail", handleThumbnail) ?? (() => undefined);
		const unsubAccent = ctx.ytmd?.on("css.thumbnail-accent", handleAccent) ?? (() => undefined);
		ctx.ytmd?.emit("track:theme-request");

		return () => {
			unsubThumb();
			unsubAccent();
			thumbnailSeq++;
			setRootStyle(THUMB_STYLE_ID, null);
			setRootStyle(BLUR_STYLE_ID, null);
			setRootStyle(ACCENT_STYLE_ID, null);
		};
	},
};

export default trackThemeRenderer;
