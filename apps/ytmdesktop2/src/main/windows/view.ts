import { lockAppChromeZoom } from "@main/domain/uiZoom";
import { defaultUrl, isDevelopment, isProduction } from "@main/infra/devUtils";
import { getLifecycleContext } from "@main/lifecycle";
import { classifyGoogleLoginPage, type GoogleLoginIdentity, nextIdentity } from "@shared/auth/googleLogin";
import { createLogger } from "@shared/utils/console";
import translations from "@translations/index";
import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, WebContentsView, WebContentsViewConstructorOptions, WebPreferences } from "electron";
import { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { getGoogleLoginState, setActiveGoogleLogin, setGoogleLoginState, userAgentFor } from "./googleLogin";
import { LockSizeOptions, loadUrlOfWebContents, lockSizeToParent } from "./webContentUtils";

const log = createLogger("windows").child("view");

/** `lockSize: false` leaves sizing to the caller (the main window lays its views out itself). */
type ViewSizeOptions = { lockSize?: LockSizeOptions | false };
type CreateApiViewOptions = ViewSizeOptions & Pick<WebPreferences, "transparent">;
export const createApiView = async <T extends WebContentsView>(path: string, postFunc?: (ctx: T) => Promise<void> | void, options?: CreateApiViewOptions): Promise<T> => {
	const view = new WebContentsView({
		webPreferences: {
			nodeIntegration: true,
			sandbox: false,
			contextIsolation: true,
			webSecurity: isProduction,
			allowRunningInsecureContent: !isProduction,
			// app chrome (toolbar, loading, notices) may rest when hidden; only the YouTube view plays
			preload: join(__dirname, "../preload/api.js"),
			transparent: options?.transparent,
		},
	}) as T;
	lockAppChromeZoom(view.webContents);
	await loadUrlOfWebContents(view.webContents, path);
	if (postFunc) await Promise.resolve(postFunc(view));
	const wnd = BrowserWindow.fromWebContents(view.webContents);
	if (wnd && options?.lockSize !== false) lockSizeToParent(wnd, options?.lockSize)(view);
	return view;
};
export const createView = async <T extends WebContentsView>(
	preload: string,
	postFunc?: (ctx: T) => Promise<void> | void,
	options: WebContentsViewConstructorOptions["webPreferences"] = {},
	sizeOptions: ViewSizeOptions = {},
): Promise<T> => {
	const view = new WebContentsView({
		webPreferences: {
			disableHtmlFullscreenWindowResize: true,
			nodeIntegration: true,
			sandbox: false,
			webSecurity: isProduction,
			allowRunningInsecureContent: !isProduction,
			contextIsolation: true,
			backgroundThrottling: false,
			...options,
			preload,
		},
	}) as T;
	view.webContents.setBackgroundThrottling(false);
	if (postFunc) await Promise.resolve(postFunc(view));
	const wnd = BrowserWindow.fromWebContents(view.webContents);
	if (wnd && sizeOptions.lockSize !== false) lockSizeToParent(wnd, sizeOptions.lockSize)(view);
	return view;
};
export const createPopup = async (options?: BrowserWindowConstructorOptions) => {
	const wnd = new BrowserWindow({
		minHeight: 400,
		minWidth: 400,
		...(options ? options : {}),
		webPreferences: {
			disableHtmlFullscreenWindowResize: true,
			nodeIntegration: true,
			sandbox: false,
			webSecurity: isProduction,
			contextIsolation: false, // window object is required to be rewritten for tracking current track
			...(options?.webPreferences ? options.webPreferences : {}),
		},
	});

	const lockSize = lockSizeToParent(wnd);
	return { popup: wnd, lockSize };
};

export const googleLoginPopup = async (authUrl: string, parent?: Electron.BrowserWindow) => {
	const webPreferences: Electron.WebPreferences = {
		nodeIntegration: false,
		nodeIntegrationInSubFrames: false,
		nodeIntegrationInWorker: false,
		webSecurity: isProduction,
		sandbox: false,
		contextIsolation: true,
		allowRunningInsecureContent: false,
		preload: join(__dirname, "../preload/login.js"),
	};
	// A normal window: resizable, not modal, not always-on-top (it used to feel like a stuck separate window).
	const { popup } = await createPopup({
		icon: appIconPath,
		title: translations.appName,
		height: 700,
		width: 900,
		minWidth: 480,
		minHeight: 520,
		resizable: true,
		maximizable: true,
		minimizable: true,
		frame: false,
		fullscreenable: false,
		autoHideMenuBar: true,
		center: true,
		webPreferences,
		...(parent ? { parent } : {}),
	});
	popup.setMenu(null);
	const noticeView = await createApiView("youtube/login-notice", undefined, { lockSize: false });
	popup.contentView.addChildView(noticeView);
	const noticeHeight = 120;
	const loginView = new WebContentsView({
		webPreferences,
	});
	popup.contentView.addChildView(loginView, 0);
	const layout = () => {
		if (popup.isDestroyed()) return;
		const [width, height] = popup.getContentSize();
		noticeView.setBounds({ height: noticeHeight, width, x: 0, y: 0 });
		loginView.setBounds({ height: Math.max(0, height - noticeHeight), width, x: 0, y: noticeHeight });
	};
	layout();
	popup.on("resize", layout);

	// Start with the identity that worked last; on Google's rejection page the notice offers the other one.
	const settings = getLifecycleContext().getProvider("settings") as
		| { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void }
		| undefined;
	let identity: GoogleLoginIdentity = settings?.get?.("googleLogin.identity") === "chrome" ? "chrome" : "firefox";
	loginView.webContents.setUserAgent(userAgentFor(identity));
	setGoogleLoginState({ phase: "signing-in", identity, rejections: 0 });

	// Google's own pop-ups (account chooser, passkeys, 2FA) stay inside the app: sending them to the default
	// browser (as before) dropped the user into Firefox, where the sign-in can't reach this app.
	loginView.webContents.setWindowOpenHandler(({ url }) => {
		if (!url.startsWith("http")) return { action: "deny" };
		return {
			action: "allow",
			overrideBrowserWindowOptions: { parent: popup, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } },
		};
	});
	loginView.webContents.on("did-create-window", (child) => child.webContents.setUserAgent(userAgentFor(identity)));
	if (isDevelopment) {
		loginView.webContents.openDevTools({ mode: "detach" });
		noticeView.webContents.openDevTools({ mode: "detach" });
	}

	let timeoutHandler: NodeJS.Timeout; // timeout after 10 minutes
	const clearGC = () => {
		timeoutHandler && clearTimeout(timeoutHandler);
	};
	ipcMain.once("subwindow.close/loginView", () => {
		popup.close();
		clearGC();
	});
	const isMusicYoutubeUrl = (url: string) => {
		try {
			return new URL(url).hostname.indexOf("music.youtube") === 0;
		} catch {
			return false;
		}
	};
	return await new Promise<boolean>((resolve, reject) => {
		timeoutHandler = setTimeout(
			() => {
				reject();
			},
			10 * 60 * 1000,
		);
		let isAuthenticated = false;
		const markAuthenticated = () => {
			if (isAuthenticated) return;
			isAuthenticated = true;
			setGoogleLoginState({ phase: "signed-in" });
			settings?.set?.("googleLogin.identity", identity); // remember what Google accepted
			popup.close();
		};
		popup.on("close", () => {
			setActiveGoogleLogin(null);
			if (!isAuthenticated) setGoogleLoginState({ phase: "closed" });
			resolve(isAuthenticated);
			clearGC();
		});
		setActiveGoogleLogin({
			retryWithOtherIdentity() {
				identity = nextIdentity(identity);
				loginView.webContents.setUserAgent(userAgentFor(identity));
				setGoogleLoginState({ phase: "signing-in", identity });
				void loginView.webContents.loadURL(authUrl, { httpReferrer: defaultUrl }).catch(() => undefined);
			},
		});
		// Recognise Google's "this browser or app may not be secure" page so the notice can offer a way out.
		const checkPage = async () => {
			if (loginView.webContents.isDestroyed()) return;
			const url = loginView.webContents.getURL();
			const text = await loginView.webContents.executeJavaScript("document.body ? document.body.innerText.slice(0, 3000) : ''").catch(() => "");
			const page = classifyGoogleLoginPage({ url, text });
			if (page === "signed-in") markAuthenticated();
			else if (page === "rejected" && getGoogleLoginState().phase !== "rejected") {
				log.warn("google rejected the sign-in browser identity", { identity });
				setGoogleLoginState({ phase: "rejected", rejections: getGoogleLoginState().rejections + 1 });
			}
		};
		loginView.webContents.on("did-finish-load", () => void checkPage());
		loginView.webContents.on("did-navigate-in-page", () => void checkPage());
		// Already logged in → Google lands on music.youtube during/after load.
		// Attach before loadURL so we don't miss the redirect race.
		const onMusicRedirect = (_ev: Electron.Event, url: string) => {
			if (isMusicYoutubeUrl(url)) markAuthenticated();
		};
		loginView.webContents.on("will-redirect", onMusicRedirect);
		loginView.webContents.on("will-navigate", onMusicRedirect);
		loginView.webContents.on("did-navigate", onMusicRedirect);
		loginView.webContents.on("did-navigate-in-page", onMusicRedirect);
		loginView.webContents.on("ipc-message", (_ev, eventName) => {
			log.debug("login event", eventName);
			if (eventName === "g-login-success") {
				markAuthenticated();
			}
		});

		void loginView.webContents
			.loadURL(authUrl, {
				httpReferrer: defaultUrl,
			})
			.then(() => {
				if (isMusicYoutubeUrl(loginView.webContents.getURL())) markAuthenticated();
			})
			.catch(() => {
				/* popup close / abort */
			});
	});
};
