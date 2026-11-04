import { is } from "@electron-toolkit/utils";
import { FORK } from "@shared/fork";
import { Logger, logger } from "@shared/utils/console";
import { ipcPromise } from "@shared/utils/ipcPromise";
import { app, WebContentsView } from "electron";
import { isProduction } from "./devUtils";
import { attachAppLogging } from "./logging";
import { applyUserDataDir } from "./userDataBootstrap";

/** Linux .desktop / Wayland app_id. Must match electron-builder `appId` (GNOME portal rejects short ids). */
export const LINUX_DESKTOP_ID = FORK.appId;

let isInitialized = false;

export function initializeCustomElectronEnvironment() {
	if (isInitialized) {
		logger.error("app is already initializing");
		app.quit();
		process.exit(0);
	}

	if (process.platform === "linux") {
		app.setDesktopName(`${LINUX_DESKTOP_ID}.desktop`);
	}

	// Isolate from the installed upstream app - same userData = shared SingleInstanceLock -> silent app.exit().
	// Normally already applied by the first import of main.ts, before any store module was evaluated.
	applyUserDataDir();
	if (!isProduction) {
		app.commandLine.appendSwitch("disable-web-security");
		app.commandLine.appendSwitch("disable-site-isolation-trials");
		logger.info("dev env", { isDev: is.dev, userData: app.getPath("userData") });
	}
	process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

	const fileLogs = import.meta.env.PROD && !process.env.DEBUG;
	attachAppLogging({ file: fileLogs });
	if (fileLogs) Logger.enableProductionMode();

	process.env.NODE_ENV = import.meta.env.MODE;
	WebContentsView.prototype.invoke = function <T>(channel: string, data: any) {
		return ipcPromise<T>(this, channel, data);
	};
	isInitialized = true;
}
