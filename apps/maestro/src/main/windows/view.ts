import { lockAppChromeZoom } from "@main/domain/uiZoom";
import { defaultUrl, isDevelopment, isProduction } from "@main/infra/devUtils";
import { getLifecycleContext } from "@main/lifecycle";
import { classifyGoogleLoginPage, type GoogleLoginIdentity, nextIdentity } from "@shared/auth/googleLogin";
import { createLogger } from "@shared/utils/console";
import translations from "@translations/index";
import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, shell, WebContentsView, WebContentsViewConstructorOptions, WebPreferences } from "electron";
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
			nodeIntegration: false,
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
			nodeIntegration: false,
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
			nodeIntegration: false,
			sandbox: false,
			webSecurity: isProduction,
			contextIsolation: true,
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
	// browser (as before) dropped the user into Firefox, where the sign-in can't reach this app. Anything else
	// ("learn more" links, other sites) opens in the default browser. Children get no preload and no relaxed
	// security, and apply the same rule to their own pop-ups.
	const isSignInHost = (url: string) => {
		try {
			const { protocol, hostname } = new URL(url);
			return protocol === "https:" && /(^|\.)(google\.[a-z.]+|gstatic\.com|youtube\.com|googleusercontent\.com)$/i.test(hostname);
		} catch {
			return false;
		}
	};
	const openHandler = ({ url }: { url: string }): ReturnType<Parameters<Electron.WebContents["setWindowOpenHandler"]>[0]> => {
		if (!isSignInHost(url)) {
			if (/^https?:\/\//.test(url)) void shell.openExternal(url);
			return { action: "deny" };
		}
		return {
			action: "allow",
			overrideBrowserWindowOptions: {
				parent: popup,
				autoHideMenuBar: true,
				webPreferences: { preload: undefined, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
			},
		};
	};
	loginView.webContents.setWindowOpenHandler(openHandler);
	loginView.webContents.on("did-create-window", (child, { url }) => {
		child.webContents.setWindowOpenHandler(openHandler);
		// the first request may have gone out with the default UA: reload with the identity
		child.webContents.setUserAgent(userAgentFor(identity));
		void child.webContents.loadURL(url).catch(() => undefined);
	});
	if (isDevelopment) {
		loginView.webContents.openDevTools({ mode: "detach" });
		noticeView.webContents.openDevTools({ mode: "detach" });
	}

	let timeoutHandler: NodeJS.Timeout; // timeout after 10 minutes
	const clearGC = () => {
		timeoutHandler && clearTimeout(timeoutHandler);
	};
	const onCloseRequest = () => {
		if (!popup.isDestroyed()) popup.close();
		clearGC();
	};
	ipcMain.once("subwindow.close/loginView", onCloseRequest);
	popup.once("closed", () => ipcMain.removeListener("subwindow.close/loginView", onCloseRequest));
	const isMusicYoutubeUrl = (url: string) => {
		try {
			return new URL(url).hostname.indexOf("music.youtube") === 0;
		} catch {
			return false;
		}
	};
	return await new Promise<boolean>((resolve) => {
		// after 10 minutes give up: close the window (resolving false) instead of leaving a live, orphaned one
		timeoutHandler = setTimeout(
			() => {
				if (!popup.isDestroyed()) popup.close();
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
			// signed in through the Firefox import: landing on music.youtube.com completes this window
			reloadAfterImport() {
				void loginView.webContents.loadURL(defaultUrl).catch(() => undefined);
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
