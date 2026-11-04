import { describe, expect, it } from "vitest";
import { romanizeLines } from "./lyricsRomanize";

describe("romanizeLines", () => {
	it("reads Korean and Chinese, and keeps Latin words", async () => {
		const [ko] = await romanizeLines(["사랑해 baby"]);
		expect(ko).toBe("saranghae baby");
		const [zh] = await romanizeLines(["我爱你 baby"]);
		expect(zh).toBe("wǒ ài nǐ baby");
	});
	it("leaves Latin lines alone", async () => {
		expect(await romanizeLines(["Never gonna give you up", ""])).toEqual([null, null]);
	});
	it("reads Japanese, kanji included", async () => {
		const out = await romanizeLines(["ありがとう", "君の名は"]);
		expect(out[0]).toMatch(/arigat/);
		expect(out[1]).toMatch(/kimi/);
	}, 30_000);
});
