import { describe, expect, it } from "vitest";
import { RETRY_WINDOW_MS, shouldRetry } from "./keep-playing.logic";

describe("shouldRetry", () => {
	it("retries the first error of a track", () => {
		expect(shouldRetry({ errors: 0, lastErrorAt: 0, now: 5000 })).toBe(true);
	});
	it("does not retry a second error within a minute", () => {
		expect(shouldRetry({ errors: 1, lastErrorAt: 5000, now: 5000 + RETRY_WINDOW_MS - 1 })).toBe(false);
	});
	it("retries again after a minute", () => {
		expect(shouldRetry({ errors: 1, lastErrorAt: 5000, now: 5000 + RETRY_WINDOW_MS })).toBe(true);
		expect(RETRY_WINDOW_MS).toBe(60_000);
	});
});
