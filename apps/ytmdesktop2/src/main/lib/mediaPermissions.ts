import type { Session } from "electron";

// Output-device selection (roadmap C3) needs device labels and `setSinkId`, which Chromium gates behind the
// "media" permission. Electron grants every permission by default, which also let any page open the microphone
// or camera without a prompt. Here: device listing and speaker selection only for YouTube Music and the app's own
// pages, and capture (microphone, camera, screen) for nobody. Other permissions keep Electron's default.

export function isTrustedOrigin(origin: string | undefined | null): boolean {
	if (!origin) return false;
	if (origin.startsWith("file://")) return true;
	try {
		const url = new URL(origin);
		if (url.protocol === "https:" && url.hostname === "music.youtube.com") return true;
		// The settings and toolbar views in development (electron-vite's dev server).
		return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
	} catch {
		return false;
	}
}

/** Permission requests (prompts): capture is always refused, speaker selection only for trusted pages, the rest keeps Electron's default (allow). */
export function allowPermissionRequest(permission: string, origin?: string | null): boolean {
	if (permission === "speaker-selection") return isTrustedOrigin(origin);
	return permission !== "media" && permission !== "display-capture";
}

/** Permission checks (no prompt): device labels and speaker selection for trusted pages only. */
export function allowPermissionCheck(permission: string, origin: string | undefined | null): boolean {
	if (permission === "media" || permission === "speaker-selection") return isTrustedOrigin(origin);
	return true;
}

export function applyMediaPermissions(session: Session): void {
	session.setPermissionRequestHandler((_wc, permission, callback, details) =>
		callback(allowPermissionRequest(permission, (details as { requestingUrl?: string } | undefined)?.requestingUrl)),
	);
	session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowPermissionCheck(permission, requestingOrigin));
}
