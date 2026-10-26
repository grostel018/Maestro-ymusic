import { artworkCrop } from "./crop";

// The window background is a tiny, pre-blurred copy of the artwork scaled to the window. Both the YouTube page
// (renderer-plugins/youtube/track-theme.renderer.ts) and the app's title bar (renderer/src/lib/surface.ts)
// make it with this function, so the two halves of the window show the same pixels.

const BLUR_SIZE = 96;
const BLUR_CACHE_MAX = 20;

/** Colors of the window surface; chrome/surface.scss uses the same values. */
export const SURFACE_BASE = "#030303";
export const SURFACE_VEIL = "rgba(3, 3, 3, 0.62)";
export const SURFACE_BAR_TINT = "rgba(3, 3, 3, 0.28)";

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

/** Draws the artwork into a tiny canvas with the blur baked in, so nothing blurs a full-size image per frame. */
export async function makeBlurredArtwork(url: string): Promise<string> {
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
		// Strong blur relative to the canvas: the image is scaled to the whole window, so any hard edge left in
		// the artwork would show as a seam across the page.
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
