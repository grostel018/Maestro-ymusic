import path from "node:path";
import { describe, expect, it } from "vitest";
import { findFilesOutside, resolveAppDataDir, resolveUserDataDir } from "./userDataPath";

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

describe("resolveAppDataDir", () => {
	it("uses Electron's appData normally", () => {
		expect(resolveAppDataDir({ env: {}, appData })).toBe(appData);
		expect(resolveAppDataDir({ env: { YTMD_E2E_APPDATA: "C:\tmp\a" }, appData })).toBe(appData);
	});

	it("uses YTMD_E2E_APPDATA only on the e2e bench", () => {
		expect(resolveAppDataDir({ env: { YTMD_E2E: "1", YTMD_E2E_APPDATA: "C:\tmp\a" }, appData })).toBe("C:\tmp\a");
		expect(resolveAppDataDir({ env: { YTMD_E2E: "1" }, appData })).toBe(appData);
	});
});

describe("findFilesOutside", () => {
	const userData = path.join(appData, "ytmdesktop2-plus");

	it("is empty when every file sits directly in userData", () => {
		expect(findFilesOutside([path.join(userData, "app-settings.yml"), path.join(userData.toUpperCase(), "ytm-auth.ytm")], userData, { ignoreCase: true })).toEqual([]);
	});

	it("lists files in another folder", () => {
		const stray = path.join(appData, "ytmdesktop2", "app-settings.yml");
		expect(findFilesOutside([path.join(userData, "a.yml"), stray], userData)).toEqual([stray]);
	});
});
