// State of the Google sign-in window, shared between the window (view.ts), the notice bar above it
// (renderer route /youtube/login-notice, via the googleLogin tRPC router) and the e2e bench.
import { listFirefoxProfiles, readFirefoxCookies } from "@main/auth/firefoxCookies";
import { defaultUrl } from "@main/infra/devUtils";
import { buildChromeUserAgent } from "@main/infra/userAgent";
import { getLifecycleContext } from "@main/lifecycle";
import { firefoxUserAgent, type GoogleLoginIdentity } from "@shared/auth/googleLogin";
import { createLogger } from "@shared/utils/console";
import { app, BrowserWindow, dialog, session } from "electron";

const log = createLogger("windows").child("googleLogin");

export type GoogleLoginPhase = "closed" | "signing-in" | "rejected" | "signed-in";

export type GoogleLoginState = {
	phase: GoogleLoginPhase;
	identity: GoogleLoginIdentity;
	/** how many times Google rejected an identity in this window */
	rejections: number;
};

type ActiveLogin = { retryWithOtherIdentity(): void; reloadAfterImport(): void };

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

/** True when a Firefox profile with a cookie database exists on this machine. */
export function firefoxImportAvailable(): boolean {
	return listFirefoxProfiles(app.getPath("appData")).length > 0;
}

export type FirefoxImportResult = { status: "imported" | "cancelled" | "no-firefox" | "nothing-found" | "error"; imported: number; profile?: string; error?: string };

/**
 * "Import Google sign-in from Firefox" (owner decision D2): after an explicit confirmation, copies the
 * youtube.com/google.com cookies of the user's default Firefox profile into this app's session, then reloads
 * YouTube Music. Local only; cookie values are never logged.
 */
export async function importGoogleSignInFromFirefox(): Promise<FirefoxImportResult> {
	const profile = listFirefoxProfiles(app.getPath("appData")).find((p) => p.isDefault);
	if (!profile) return { status: "no-firefox", imported: 0 };
	const parent = BrowserWindow.getFocusedWindow() ?? undefined;
	const options: Electron.MessageBoxOptions = {
		type: "question",
		buttons: ["Import", "Cancel"],
		defaultId: 0,
		cancelId: 1,
		title: "Import Google sign-in from Firefox",
		message: `Copy your YouTube / Google sign-in from Firefox ("${profile.name}") into this app?`,
		detail:
			"Only youtube.com and google.com cookies are copied, from this computer's Firefox into this app. Nothing is sent anywhere. " +
			"Google may ask you to confirm it's you the first time.",
	};
	const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
	if (response !== 0) return { status: "cancelled", imported: 0, profile: profile.name };
	try {
		const cookies = readFirefoxCookies(profile.dir);
		if (!cookies.length) return { status: "nothing-found", imported: 0, profile: profile.name };
		let imported = 0;
		for (const c of cookies) {
			try {
				await session.defaultSession.cookies.set(c);
				imported++;
			} catch (err) {
				log.warn(`cookie not importable: ${c.name}@${c.domain ?? c.url}`, (err as Error).message);
			}
		}
		await session.defaultSession.cookies.flushStore();
		log.info(`imported ${imported}/${cookies.length} cookies from Firefox profile "${profile.name}"`);
		active?.reloadAfterImport();
		const views = (getLifecycleContext().windows as { views?: { youtubeView?: Electron.WebContentsView } } | undefined)?.views;
		void views?.youtubeView?.webContents.loadURL(defaultUrl).catch(() => undefined);
		return { status: "imported", imported, profile: profile.name };
	} catch (err) {
		log.error("Firefox sign-in import failed", err);
		return { status: "error", imported: 0, profile: profile.name, error: (err as Error).message };
	}
}
