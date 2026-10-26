// State of the Google sign-in window, shared between the window (view.ts), the notice bar above it
// (renderer route /youtube/login-notice, via the googleLogin tRPC router) and the e2e bench.
import { buildChromeUserAgent } from "@main/infra/userAgent";
import { firefoxUserAgent, type GoogleLoginIdentity } from "@shared/auth/googleLogin";

export type GoogleLoginPhase = "closed" | "signing-in" | "rejected" | "signed-in";

export type GoogleLoginState = {
	phase: GoogleLoginPhase;
	identity: GoogleLoginIdentity;
	/** how many times Google rejected an identity in this window */
	rejections: number;
};

type ActiveLogin = { retryWithOtherIdentity(): void };

let state: GoogleLoginState = { phase: "closed", identity: "firefox", rejections: 0 };
let active: ActiveLogin | null = null;

export function userAgentFor(identity: GoogleLoginIdentity): string {
	return identity === "chrome" ? buildChromeUserAgent() : firefoxUserAgent();
}

export function getGoogleLoginState(): GoogleLoginState {
	return state;
}

export function setGoogleLoginState(patch: Partial<GoogleLoginState>): void {
	state = { ...state, ...patch };
}

export function setActiveGoogleLogin(login: ActiveLogin | null): void {
	active = login;
}

/** Reloads the open sign-in window with the other browser identity; false when no window is open. */
export function retryGoogleLogin(): boolean {
	if (!active) return false;
	active.retryWithOtherIdentity();
	return true;
}
