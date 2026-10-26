import path from "node:path";
import { describe, expect, it } from "vitest";
import { type FirefoxCookieRow, firefoxDir, parseProfilesIni, toElectronCookie } from "./firefoxCookies";

const FF = "C:\\Users\\me\\AppData\\Roaming\\Mozilla\\Firefox";
const INI = `[General]
StartWithLastProfile=1
Version=2

[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/bzso1gs8.default-release

[Install308046B0AF4A39CB]
Default=Profiles/bzso1gs8.default-release
Locked=1

[Profile1]
Name=default
IsRelative=1
Path=Profiles/abc.default
Default=1
`;

describe("parseProfilesIni", () => {
	it("prefers the profile named by the [Install…] section over Default=1", () => {
		const profiles = parseProfilesIni(INI, FF);
		expect(profiles.map((p) => [p.name, p.isDefault])).toEqual([
			["default-release", true],
			["default", false],
		]);
		expect(profiles[0].dir).toBe(path.join(FF, "Profiles/bzso1gs8.default-release"));
	});
	it("falls back to Default=1, then the first profile; absolute paths kept", () => {
		const noInstall = INI.replace(/\[Install[\s\S]*?Locked=1\n/, "");
		expect(parseProfilesIni(noInstall, FF).find((p) => p.isDefault)?.name).toBe("default");
		const abs = "[Profile0]\nName=x\nIsRelative=0\nPath=D:\\ff\\x\n";
		expect(parseProfilesIni(abs, FF)).toEqual([{ name: "x", dir: "D:\\ff\\x", isDefault: true }]);
	});
});

describe("firefoxDir", () => {
	it("only honours the bench override under YTMD_E2E=1", () => {
		expect(firefoxDir("C:\\AppData", { YTMD_E2E_FIREFOX_DIR: "X:\\fake" })).toBe(path.join("C:\\AppData", "Mozilla", "Firefox"));
		expect(firefoxDir("C:\\AppData", { YTMD_E2E: "1", YTMD_E2E_FIREFOX_DIR: "X:\\fake" })).toBe("X:\\fake");
	});
});

const row = (r: Partial<FirefoxCookieRow>): FirefoxCookieRow => ({
	name: "SID",
	value: "v",
	host: ".youtube.com",
	path: "/",
	expiry: 2_000_000_000,
	isSecure: 1,
	isHttpOnly: 1,
	sameSite: 0,
	...r,
});

describe("toElectronCookie", () => {
	const now = 1_800_000_000;
	it("maps a domain cookie", () => {
		expect(toElectronCookie(row({}), now)).toEqual({
			url: "https://youtube.com/",
			name: "SID",
			value: "v",
			domain: ".youtube.com",
			path: "/",
			secure: true,
			httpOnly: true,
			expirationDate: 2_000_000_000,
			sameSite: "no_restriction",
		});
	});
	it("handles millisecond expiry, host-only and __Host- cookies, sameSite values", () => {
		const ms = toElectronCookie(row({ expiry: 2_000_000_000_000 }), now);
		expect(ms?.expirationDate).toBe(2_000_000_000);
		const hostOnly = toElectronCookie(row({ host: "accounts.google.com", sameSite: 1 }), now);
		expect(hostOnly?.domain).toBeUndefined();
		expect(hostOnly?.sameSite).toBe("lax");
		const host = toElectronCookie(row({ name: "__Host-GAPS", host: ".google.com", isSecure: 0, sameSite: 2 }), now);
		expect(host?.domain).toBeUndefined();
		expect(host?.secure).toBe(true);
		expect(host?.sameSite).toBe("strict");
	});
	it("skips other sites, expired cookies and nameless rows", () => {
		expect(toElectronCookie(row({ host: ".example.com" }), now)).toBeNull();
		expect(toElectronCookie(row({ host: ".notyoutube.com" }), now)).toBeNull();
		expect(toElectronCookie(row({ expiry: 1_000 }), now)).toBeNull();
		expect(toElectronCookie(row({ name: "" }), now)).toBeNull();
	});
});
