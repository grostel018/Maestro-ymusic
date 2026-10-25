import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUserDataDir } from "./userDataPath";

const appData = path.join("C:", "Users", "x", "AppData", "Roaming");

describe("resolveUserDataDir", () => {
	it("uses the dev folder in development", () => {
		expect(resolveUserDataDir({ isProduction: false, argv: [], appData })).toBe(path.join(appData, "ytmdesktop2-dev"));
	});

	it("uses the fork folder in production", () => {
		expect(resolveUserDataDir({ isProduction: true, argv: [], appData })).toBe(path.join(appData, "ytmdesktop2-plus"));
	});

	it("defers to --user-data-dir in either mode", () => {
		for (const isProduction of [true, false]) {
			expect(resolveUserDataDir({ isProduction, argv: ["--user-data-dir=C:\tmp\p"], appData })).toBeNull();
			expect(resolveUserDataDir({ isProduction, argv: ["--user-data-dir", "C:\tmp\p"], appData })).toBeNull();
		}
	});

	it("never returns the installed app's profile in production", () => {
		const dir = resolveUserDataDir({ isProduction: true, argv: [], appData });
		expect(dir?.endsWith("ytmdesktop2")).toBe(false);
	});
});
