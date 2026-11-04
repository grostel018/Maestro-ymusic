import { describe, expect, it } from "vitest";
import { formatSentryRelease } from "./sentry-release";

describe("formatSentryRelease", () => {
	it("uses version when hash is missing", () => {
		expect(formatSentryRelease("1.2.3", undefined)).toBe("maestro@1.2.3");
		expect(formatSentryRelease("1.2.3", "")).toBe("maestro@1.2.3");
	});

	it("appends a short git hash", () => {
		expect(formatSentryRelease("1.2.3", "abcdef012345")).toBe("maestro@1.2.3+abcdef0");
	});
});
