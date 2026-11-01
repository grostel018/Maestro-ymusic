import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, isLightLook, lookCss, luminance, PALETTES } from "./look";

const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

describe("palettes", () => {
	it("every light palette's text and secondary text can be read on its background", () => {
		for (const p of PALETTES.filter((x) => isLightLook({ ...DEFAULT_LOOK, palette: x.id }))) {
			expect(contrast(p.tokens.text, p.tokens.base), `${p.name} text`).toBeGreaterThanOrEqual(4.5);
			expect(contrast(p.tokens.subtext, p.tokens.base), `${p.name} subtext`).toBeGreaterThanOrEqual(4.5);
		}
	});
	it("tells light from dark, imported themes included", () => {
		expect(isLightLook(DEFAULT_LOOK)).toBe(false);
		expect(isLightLook({ ...DEFAULT_LOOK, palette: "light" })).toBe(true);
		const imported = { name: "x", base: "#f0f0f0", surface: "#e0e0e0", text: "#111111", subtext: "#444444", accent: "#0000ff" };
		expect(isLightLook({ ...DEFAULT_LOOK, palette: "imported", imported })).toBe(true);
	});
	it("adds the light overrides only to light looks", () => {
		expect(lookCss(DEFAULT_LOOK)).not.toContain("--iron-icon-fill-color");
		expect(lookCss({ ...DEFAULT_LOOK, palette: "light" })).toContain("--iron-icon-fill-color");
	});
});
