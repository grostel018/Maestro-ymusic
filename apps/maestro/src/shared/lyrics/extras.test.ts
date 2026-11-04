import { describe, expect, it } from "vitest";
import { chunkLines, lineScript, normalizeExtrasRequest, parseGoogleTranslate, sameLanguage, songHasKana } from "./extras";

describe("lineScript", () => {
	it("tells the scripts apart", () => {
		expect(lineScript("사랑해", false)).toBe("ko");
		expect(lineScript("ありがとう", false)).toBe("ja");
		expect(lineScript("我爱你", false)).toBe("zh");
		expect(lineScript("Never gonna give you up", false)).toBe(null);
		expect(lineScript("Tout seul dans ma bulle", false)).toBe(null);
	});
	it("reads kanji-only lines as Japanese in a Japanese song", () => {
		const song = ["君の名は", "運命"];
		expect(songHasKana(song)).toBe(true);
		expect(lineScript("運命", songHasKana(song))).toBe("ja");
		expect(lineScript("运命", songHasKana(["运命"]))).toBe("zh");
	});
});

describe("normalizeExtrasRequest", () => {
	it("rejects junk and caps sizes", () => {
		expect(normalizeExtrasRequest(null)).toBe(null);
		expect(normalizeExtrasRequest({ videoId: "", lines: [] })).toBe(null);
		expect(normalizeExtrasRequest({ videoId: "a", lines: "x" })).toBe(null);
		const r = normalizeExtrasRequest({ videoId: "a", lines: ["x", 3], romanize: true, translateTo: "fr&evil=1" });
		expect(r).toEqual({ videoId: "a", lines: ["x", ""], romanize: true, translateTo: null });
		expect(normalizeExtrasRequest({ videoId: "a", lines: [], translateTo: "zh-CN" })?.translateTo).toBe("zh-CN");
	});
});

describe("parseGoogleTranslate", () => {
	it("joins the parts and reads the source language", () => {
		expect(parseGoogleTranslate([[["Bonjour\n", "Hello\n"], ["le monde", "world"]], null, "en"])).toEqual({ text: "Bonjour\nle monde", source: "en" });
	});
	it("gives up on an unknown shape", () => {
		expect(parseGoogleTranslate({ error: 1 })).toBe(null);
		expect(parseGoogleTranslate(null)).toBe(null);
	});
});

describe("chunkLines", () => {
	it("keeps every line and stays under the limit", () => {
		expect(chunkLines(["aaaa", "bbbb", "cccc"], 10)).toEqual([["aaaa", "bbbb"], ["cccc"]]);
	});
});

describe("sameLanguage", () => {
	it("compares the base language", () => {
		expect(sameLanguage("zh-CN", "zh-TW")).toBe(true);
		expect(sameLanguage("fr", "en")).toBe(false);
		expect(sameLanguage(null, "en")).toBe(false);
	});
});
