// Side-effect module, imported first by main.ts: it points userData at this build's own profile before any module
// that opens a store (settings, credentials, auth, window state, thumbnails) is evaluated. Keep its imports minimal.
import { app } from "electron";
import { resolveAppDataDir, resolveUserDataDir } from "./userDataPath";

let applied = false;

/** Sets userData to the fork profile (dev: ytmdesktop2-dev) unless `--user-data-dir` is passed. Runs once. */
export function applyUserDataDir() {
	if (applied) return;
	applied = true;
	const appData = resolveAppDataDir({ env: process.env, appData: app.getPath("appData") });
	if (appData !== app.getPath("appData")) app.setPath("appData", appData);
	const userData = resolveUserDataDir({ isProduction: import.meta.env.PROD, argv: process.argv, appData });
	if (userData) app.setPath("userData", userData);
}

applyUserDataDir();
