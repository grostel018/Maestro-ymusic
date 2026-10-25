import { describe, expect, it } from "vitest";
import { parseSuiteLog } from "./suite-log.ts";

describe("parseSuiteLog", () => {
	it("reads passed and failed ids and the summary", () => {
		const r = parseSuiteLog("PASS s1 boot\nFAIL s3 fullscreen: x\n1/2 passed\n");
		expect(r.passed).toEqual(new Set(["s1"]));
		expect(r.failed).toEqual(new Set(["s3"]));
		expect(r.summary).toEqual({ passed: 1, total: 2 });
	});
	it("handles ids with a letter suffix, CRLF and noise lines", () => {
		const crlf = String.fromCharCode(13, 10);
		const text = ["work folder: x", "PASS p3b Playing", "FAIL p7 Minimized: only 49 s", "  screenshot: a PASS s9", "7/8 passed", ""].join(crlf);
		const r = parseSuiteLog(text);
		expect(r.passed).toEqual(new Set(["p3b"]));
		expect(r.failed).toEqual(new Set(["p7"]));
		expect(r.summary).toEqual({ passed: 7, total: 8 });
	});
	it("returns null summary when absent", () => {
		expect(parseSuiteLog("").summary).toBeNull();
	});
});
