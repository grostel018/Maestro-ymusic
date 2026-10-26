export type CropRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * Source rectangle of the artwork worth using for the window background. YouTube video thumbnails
 * (hq/mq/sd) are 4:3 images that carry 16:9 art with black bands top and bottom; blurred and scaled to the
 * whole window those bands show up as horizontal seams, so a 4:3 image is cropped to its 16:9 middle.
 * Anything else (square album art, real 16:9 maxres thumbnails) is used whole.
 */
export function artworkCrop(width: number, height: number): CropRect {
	if (width <= 0 || height <= 0) return { sx: 0, sy: 0, sw: Math.max(0, width), sh: Math.max(0, height) };
	const ratio = width / height;
	if (Math.abs(ratio - 4 / 3) < 0.02) {
		const sh = Math.round((width * 9) / 16);
		return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
	}
	return { sx: 0, sy: 0, sw: width, sh: height };
}
