import { describe, expect, it } from "vitest";
import { classifyGoogleLoginPage, FIREFOX_UA_VERSION, firefoxUserAgent, nextIdentity } from "./googleLogin";

describe("firefoxUserAgent", () => {
	it("is a well-formed, current Firefox UA per platform", () => {
		const win = firefoxUserAgent("win32");
		expect(win).toBe(`Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${FIREFOX_UA_VERSION}) Gecko/20100101 Firefox/${FIREFOX_UA_VERSION}`);
		expect(firefoxUserAgent("linux")).toContain("X11; Linux x86_64");
		expect(firefoxUserAgent("darwin")).toContain("Macintosh");
		// guards against regressing to the 2021 UA Google rejects
		expect(Number.parseInt(FIREFOX_UA_VERSION, 10)).toBeGreaterThanOrEqual(140);
	});
});

describe("nextIdentity", () => {
	it("alternates between the two identities", () => {
		expect(nextIdentity("firefox")).toBe("chrome");
		expect(nextIdentity("chrome")).toBe("firefox");
	});
});

describe("classifyGoogleLoginPage", () => {
	it("is signed in once music.youtube.com is reached", () => {
		expect(classifyGoogleLoginPage({ url: "https://music.youtube.com/" })).toBe("signed-in");
	});
	it("detects Google's rejection by URL or text", () => {
		expect(classifyGoogleLoginPage({ url: "https://accounts.google.com/v3/signin/rejected?x=1" })).toBe("rejected");
		expect(
			classifyGoogleLoginPage({ url: "https://accounts.google.com/v3/signin/identifier", text: "Couldn’t sign you in\nThis browser or app may not be secure." }),
		).toBe("rejected");
		expect(classifyGoogleLoginPage({ url: "https://accounts.google.fr/signin", text: "Ce navigateur ou cette application ne sont peut-être pas sécurisés" })).toBe(
			"rejected",
		);
	});
	it("is still in progress on normal sign-in pages and odd input", () => {
		expect(classifyGoogleLoginPage({ url: "https://accounts.google.com/v3/signin/identifier", text: "Sign in. Use your Google Account" })).toBe("in-progress");
		expect(classifyGoogleLoginPage({ url: "https://example.com/", text: "This browser or app may not be secure" })).toBe("in-progress");
		expect(classifyGoogleLoginPage({ url: "not a url" })).toBe("in-progress");
	});
});
