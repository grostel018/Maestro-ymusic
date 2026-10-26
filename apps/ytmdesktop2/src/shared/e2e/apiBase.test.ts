import { describe, expect, it } from "vitest";
import { apiBase } from "./apiBase";

const DEFAULT = "https://ws.audioscrobbler.com/2.0";

describe("apiBase", () => {
	it("ignores overrides outside the bench", () => {
		expect(apiBase("lastfm", DEFAULT, { YTMD_E2E_API_LASTFM: "http://127.0.0.1:1" })).toBe(DEFAULT);
		expect(apiBase("lastfm", DEFAULT, { YTMD_E2E: "0", YTMD_E2E_API_LASTFM: "http://127.0.0.1:1" })).toBe(DEFAULT);
	});
	it("uses the override under the bench, case-insensitive name, trailing slash trimmed", () => {
		expect(apiBase("lastFm", DEFAULT, { YTMD_E2E: "1", YTMD_E2E_API_LASTFM: " http://127.0.0.1:4000/ " })).toBe("http://127.0.0.1:4000");
	});
	it("falls back to the default when the override is empty or missing", () => {
		expect(apiBase("lastfm", DEFAULT, { YTMD_E2E: "1", YTMD_E2E_API_LASTFM: "  " })).toBe(DEFAULT);
		expect(apiBase("genius", DEFAULT, { YTMD_E2E: "1" })).toBe(DEFAULT);
	});
});
