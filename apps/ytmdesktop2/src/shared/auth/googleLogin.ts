/**
 * Google sign-in inside the app. Google refuses browsers it considers outdated or embedded, so the login
 * window presents one of two browser identities and switches to the other one when Google rejects it.
 */
export type GoogleLoginIdentity = "firefox" | "chrome";

export const GOOGLE_LOGIN_IDENTITIES: readonly GoogleLoginIdentity[] = ["firefox", "chrome"];

/**
 * Firefox version presented by the "firefox" identity. Keep it within a few releases of current Firefox:
 * Google treats old versions as insecure. Last checked 2026-10 (upstream used Firefox 92 from 2021).
 */
export const FIREFOX_UA_VERSION = "150.0";

export function firefoxUserAgent(platform: NodeJS.Platform = process.platform, version = FIREFOX_UA_VERSION): string {
	switch (platform) {
		case "darwin":
			return `Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:${version}) Gecko/20100101 Firefox/${version}`;
		case "linux":
			return `Mozilla/5.0 (X11; Linux x86_64; rv:${version}) Gecko/20100101 Firefox/${version}`;
		default:
			return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}) Gecko/20100101 Firefox/${version}`;
	}
}

export function nextIdentity(current: GoogleLoginIdentity): GoogleLoginIdentity {
	return current === "firefox" ? "chrome" : "firefox";
}

export type GoogleLoginPage = "signed-in" | "rejected" | "in-progress";

const REJECTED_URL = /\/signin\/(v\d\/)?rejected|\/signin\/v\d\/identifier\/rejected/i;
const REJECTED_TEXT =
	/(this )?browser or app may not be secure|couldn.?t sign you in|this browser may not be secure|try using a different browser|navigateur ou cette application ne sont peut-être pas sécurisés|impossible de vous connecter/i;

/** What the login window is showing: done (on music.youtube.com), Google's rejection page, or still signing in. */
export function classifyGoogleLoginPage(page: { url: string; text?: string }): GoogleLoginPage {
	let host = "";
	try {
		host = new URL(page.url).hostname;
	} catch {
		return "in-progress";
	}
	if (host.startsWith("music.youtube.")) return "signed-in";
	if (REJECTED_URL.test(page.url)) return "rejected";
	if (/^accounts\.google\./.test(host) && page.text && REJECTED_TEXT.test(page.text)) return "rejected";
	return "in-progress";
}
