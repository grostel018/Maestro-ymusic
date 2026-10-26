import { describe, expect, it } from "vitest";
import { artworkCrop } from "./crop";

describe("artworkCrop", () => {
	it("crops a 4:3 YouTube thumbnail (hqdefault 480x360) to its 16:9 middle", () => {
		expect(artworkCrop(480, 360)).toEqual({ sx: 0, sy: 45, sw: 480, sh: 270 });
	});
	it("keeps square album art and 16:9 images whole", () => {
		expect(artworkCrop(544, 544)).toEqual({ sx: 0, sy: 0, sw: 544, sh: 544 });
		expect(artworkCrop(1280, 720)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
	});
	it("handles empty images", () => {
		expect(artworkCrop(0, 0)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
	});
});
