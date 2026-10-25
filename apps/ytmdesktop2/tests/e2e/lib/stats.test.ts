import { describe, expect, it } from "vitest";
import { summarizeFrames } from "./stats.ts";

describe("summarizeFrames", () => {
	it("summarizes frame deltas", () => {
		const d = [...Array(95).fill(16), 30, 30, 30, 30, 100];
		expect(summarizeFrames(d)).toEqual({ p50: 16, p95: 30, max: 100, droppedPct: 5 });
	});
	it("handles empty input", () => {
		expect(summarizeFrames([])).toEqual({ p50: 0, p95: 0, max: 0, droppedPct: 0 });
	});
});
