import { describe, expect, it } from "vitest";
import { estimateWords, syllables, withEstimatedWords } from "./estimate";

describe("estimateWords", () => {
	it("splits a line by syllables and keeps the spaces", () => {
		const words = estimateWords({ timeMs: 1000, durationMs: 4000, text: "Oh nan, oh nan" }) ?? [];
		expect(words.map((w) => w.text).join("")).toBe("Oh nan, oh nan");
		expect(words[0].timeMs).toBe(1000);
		const end = words.at(-1)!;
		expect(end.timeMs + end.durationMs).toBeLessThanOrEqual(1000 + 4000);
	});
	it("caps the sung part on a long gap", () => {
		const words = estimateWords({ timeMs: 0, durationMs: 30000, text: "Yeah yeah" }) ?? [];
		const end = words.at(-1)!;
		expect(end.timeMs + end.durationMs).toBeLessThan(2000);
	});
	it("leaves word-synced lines and one-word lines alone", () => {
		const line = { timeMs: 0, durationMs: 1000, text: "a b", words: [{ timeMs: 0, durationMs: 1000, text: "a b" }] };
		expect(withEstimatedWords(line)).toBe(line);
		expect(estimateWords({ timeMs: 0, durationMs: 1000, text: "Yeah" })).toBeNull();
	});
	it("counts syllables", () => {
		expect(syllables("chevauché")).toBe(3);
		expect(syllables("Mmm")).toBe(1);
	});
});
