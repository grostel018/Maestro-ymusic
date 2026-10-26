import { artworkCrop } from "./track-theme.crop";
import type { RendererPluginRegistration } from "./world0/types";

const THUMB_STYLE_ID = "ytmd-track-theme-thumbnail";
const ACCENT_STYLE_ID = "ytmd-track-theme-accent";
const BLUR_STYLE_ID = "ytmd-track-theme-thumbnail-blur";
const BLUR_SIZE = 96;
const BLUR_CACHE_MAX = 20;

/** Pre-blurred artwork data URLs by thumbnail URL, least recently used first. */
const blurCache = new Map<string, string>();

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/** Draws the artwork into a tiny canvas with the blur baked in, so the page never blurs a full-size image per frame. */
async function makeBlurredThumbnail(url: string): Promise<string> {
	const cached = blurCache.get(url);
	if (cached) {
		blurCache.delete(url);
		blurCache.set(url, cached);
		return cached;
	}
	const response = await fetch(url, { mode: "cors" });
	if (!response.ok) throw new Error(`thumbnail ${response.status}`);
	const bitmap = await createImageBitmap(await response.blob());
	try {
		const canvas = new OffscreenCanvas(BLUR_SIZE, BLUR_SIZE);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("no 2d context");
		// Strong blur relative to the 48 px canvas: the image is scaled to the whole window, so any hard edge
		// left in the artwork would show as a seam across the page.
		ctx.filter = "blur(12px) saturate(130%) brightness(1.1)";
		const { sx, sy, sw, sh } = artworkCrop(bitmap.width, bitmap.height);
		ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, BLUR_SIZE, BLUR_SIZE);
		const dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 }));
		blurCache.set(url, dataUrl);
		if (blurCache.size > BLUR_CACHE_MAX) blurCache.delete(blurCache.keys().next().value as string);
		return dataUrl;
	} finally {
		bitmap.close();
	}
}

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
			makeBlurredThumbnail(address).then(
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
