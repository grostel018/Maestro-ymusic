import { applyYoutubeZoom, bindYoutubeWebContents, TOOLBAR_HEIGHT } from "@main/domain/uiZoom";
import { defaultUrl, isDevelopment, isProdDebug, isProduction } from "@main/infra/devUtils";
import { toChromeUserAgent } from "@main/infra/userAgent";
import { serverMain } from "@main/ipc/serverEvents";
import { getLifecycleContext } from "@main/lifecycle";
import { CHROMECAST_SETTING_KEY, chromecastArgvFor } from "@shared/chromecast/flag";
import { logger } from "@shared/utils/console";
import translations from "@translations/index";
import { app, BrowserWindow, BrowserWindowConstructorOptions, WebContentsView } from "electron";
import { debounce } from "lodash-es";
import { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { computeViewBounds, createFullscreenRestore } from "./layout";
import { createWindowContext } from "./mappedWindow";
import { createApiView, createView, googleLoginPopup } from "./view";
import { pushWindowStates } from "./webContentUtils";
import { getBoundsWithScaleFactor, wrapWindowHandler } from "./windowUtils";

function isChromecastSettingEnabled(): boolean {
	try {
		const settings = getLifecycleContext().getProvider("settings") as { get?: (key: string, fallback?: boolean) => boolean };
		return !!settings?.get?.(CHROMECAST_SETTING_KEY, false);
	} catch {
		return false;
	}
}

export function isGoogleLoginUrl(url: URL): boolean {
	return /^accounts\.google\.(\w+)/.test(url.hostname);
}
export function isPreventedNavOrRedirect(url: URL): boolean {
	return (
		/^(?!consent\.youtube\.com|accounts\.youtube\.com|music\.youtube\.com|accounts\.google\.\w+)$/.test(url.hostname) &&
		!/^(www\.youtube\.com|youtube\.com)\/(premium|musicpremium)$/i.test(url.hostname + url.pathname) &&
		!url.hostname.match(/^accounts\.google\.(\w+)$/)
	);
}

const GOOGLE_LOGIN_URL =
	"https://accounts.google.com/ServiceLogin?" +
	new URLSearchParams({
		ltmpl: "music",
		service: "youtube",
		continue: "https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=https://music.youtube.com/",
	}).toString();
export interface WindowViews extends Record<string, WebContentsView> {
	youtubeView: WebContentsView;
	toolbarView: WebContentsView;
}

export class WindowManager {
	private mainWindow: BrowserWindow | null = null;
	private views: WindowViews | null = null;
	private loadingView: WebContentsView | null = null;
	private isGoogleLoginProcessing = false;
	private userAgentResolved: string | null = null;
	/** YouTube Music's own fullscreen (HTML fullscreen) is active: the toolbar is hidden. */
	private htmlFullscreen = false;
	private readonly fullscreenRestore = createFullscreenRestore();

	constructor(private readonly userAgent?: string) {}

	async createRootWindow(options?: BrowserWindowConstructorOptions) {
		const bounds = {
			width: 1500,
			height: 800,
		};
		this.mainWindow = new BrowserWindow({
			...bounds,
			minWidth: 800,
			minHeight: 480,
			autoHideMenuBar: true,
			icon: appIconPath,
			backgroundColor: "#030404",
			center: true,
			closable: true,
			skipTaskbar: false,
			resizable: true,
			frame: false,
			title: translations.appName,
			darkTheme: true,
			titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
			maximizable: true,
			show: false,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: true,
				sandbox: false,
				webSecurity: isProduction,
				allowRunningInsecureContent: !isProduction,
				backgroundThrottling: false,
				autoplayPolicy: "user-gesture-required",
				enableBlinkFeatures: "FluentScrollbars,FluentOverlayScrollbar,OverlayScrollbar",
				...(options?.webPreferences || {}),
			},
			...(options || {}),
		});

		this.setupWindowUserAgent();
		await this.setupViews();
		this.setupWindowEvents();
		await this.initializeWindowState(bounds);

		return createWindowContext({
			main: this.mainWindow,
			views: this.views!,
		});
	}

	private setupWindowUserAgent() {
		if (!this.mainWindow) return;

		const chromeUa = this.userAgent ?? toChromeUserAgent(this.mainWindow.webContents.getUserAgent());
		this.userAgentResolved = chromeUa;
		app.userAgentFallback = chromeUa;
		this.mainWindow.webContents.setUserAgent(chromeUa);
		logger.debug("chrome user-agent", chromeUa);
	}

	private applyChromeUserAgent(view: WebContentsView) {
		const chromeUa = this.userAgentResolved ?? this.userAgent ?? toChromeUserAgent(view.webContents.getUserAgent());
		this.userAgentResolved = chromeUa;
		view.webContents.setUserAgent(chromeUa);
	}

	private async setupViews() {
		if (!this.mainWindow) return;

		this.loadingView = await this.createLoadingView();
		this.views = {
			youtubeView: await this.createYoutubeView(),
			toolbarView: await this.createToolbarView(),
		};
		this.setupViewEvents();
	}

	private async createLoadingView() {
		const view = await createApiView(
			"/youtube/loading",
			(view) => {
				if (!this.mainWindow) return;

				this.mainWindow.contentView.addChildView(view);
				if (isDevelopment || isProdDebug) view.webContents.openDevTools({ mode: "detach" });

				const [width, height] = this.mainWindow.getContentSize();
				view.setBounds({ x: 0, y: 0, width, height });
			},
			{ lockSize: false },
		);
		return view;
	}

	private async createYoutubeView() {
		return await createView(
			join(__dirname, "../preload/youtube.js"),
			(view) => {
				if (!this.mainWindow) return;

				this.applyChromeUserAgent(view);
				this.mainWindow.contentView.addChildView(view);
				view.setBounds(this.computeBounds().youtube);
				bindYoutubeWebContents(view.webContents);

				this.setupYoutubeViewEvents(view);
			},
			{
				sandbox: false,
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
				additionalArguments: [chromecastArgvFor(isChromecastSettingEnabled())],
			},
			{ lockSize: false },
		);
	}

	private async createToolbarView() {
		return await createApiView(
			"/youtube/toolbar",
			(view) => {
				if (!this.mainWindow) return;

				// opaque: a transparent toolbar shows whatever was composited below it while the window resizes
				view.setBackgroundColor("#030404");
				this.mainWindow.contentView.addChildView(view);
				this.mainWindow.contentView.addChildView(this.loadingView!);
				const { toolbar } = this.computeBounds();
				if (toolbar) view.setBounds(toolbar);
				if (isDevelopment) view.webContents.openDevTools({ mode: "detach" });
			},
			{ lockSize: false },
		);
	}

	private setupYoutubeViewEvents(view: WebContentsView) {
		let lastLocation: string;

		view.webContents.on("did-navigate", (ev, location) => {
			lastLocation = location;
		});
		// Prevent navigation if google is processing login
		view.webContents.on("will-navigate", (ev, location) => {
			if (this.isGoogleLoginProcessing) {
				ev.preventDefault();
				return;
			}
			if (!lastLocation || new URL(lastLocation).origin !== new URL(location).origin) {
				logger.info(`will-navigate: ${location}`);
			}
			if (location?.match(/^https?\:\/\/(accounts)?.google.([a-z]+)/)) {
				ev.preventDefault();
				this.handleGoogleLogin(location, view);
			}
		});

		// Handle YouTube Music View navigation, restart internal app service cycle if needed
		view.webContents.on("will-navigate", (ev, location) => {
			if (!lastLocation?.match(defaultUrl) && !!location?.match(defaultUrl)) {
				serverMain.emit("app.loadStart");
			} else {
				pushWindowStates(view.webContents.id);
			}
		});
		// Handle YouTube Music View redirects that may require premium subscription
		view.webContents.on("will-redirect", (event) => {
			const url = new URL(event.url);
			if (isPreventedNavOrRedirect(url)) {
				event.preventDefault();
				logger.info(`Handling YouTube Music View navigation: ${event.url}`);
			}

			if (/^(?:www\.)?youtube\.com\/(?:premium|musicpremium)$/i.test(url.hostname + url.pathname)) {
				// Redirecting to Google sign-in page for YouTube Music access, maybe require premium subscription
				this.handleGoogleLogin(GOOGLE_LOGIN_URL, view);
			}
		});
		// view.webContents.on("did-finish-load", () => {
		// 	if (this._youtubeReady) return;
		// 	setTimeout(() => {
		// 		if (this._youtubeReady) return;
		// 		logger.warn("app.loadEnd fallback after youtube did-finish-load");
		// 		serverMain.emit("app.loadEnd");
		// 	}, 2500);
		// });
		view.webContents.on("page-title-updated", (ev, title) => view.webContents.emit("window-title-updated", title));
		// disableHtmlFullscreenWindowResize is set on this view, so the window follows HTML fullscreen here
		view.webContents.on("enter-html-full-screen", () => {
			if (!this.mainWindow) return;
			this.fullscreenRestore.enter({ maximized: this.mainWindow.isMaximized(), fullScreen: this.mainWindow.isFullScreen() });
			this.htmlFullscreen = true;
			this.mainWindow.setFullScreen(true);
			this.applyLayout();
		});
		view.webContents.on("leave-html-full-screen", () => {
			if (!this.mainWindow) return;
			this.htmlFullscreen = false;
			const prev = this.fullscreenRestore.leave();
			if (prev) {
				this.mainWindow.setFullScreen(prev.fullScreen);
				if (prev.maximized) this.mainWindow.maximize();
			}
			this.applyLayout();
		});
	}

	private async handleGoogleLogin(location: string, view: WebContentsView) {
		this.isGoogleLoginProcessing = true;
		try {
			const isAuthenticated = await googleLoginPopup(location, this.mainWindow!);
			if (isAuthenticated) {
				view.webContents.reload();
				serverMain.emit("app.loadStart");
				await new Promise<void>((resolve) => view.webContents.once("did-finish-load", () => resolve()));
			}
		} catch (error) {
			logger.error("Error handling Google login", error);
		} finally {
			this.isGoogleLoginProcessing = false;
		}
	}
	private _youtubeReady: boolean = false;
	get youtubeReady() {
		return this._youtubeReady;
	}
	private setupViewEvents() {
		const handleLoadEnd = () => {
			if (!this.mainWindow || !this.loadingView || !this.views) return;
			this.mainWindow.contentView.removeChildView(this.loadingView);
			if (!this.htmlFullscreen) this.mainWindow.contentView.addChildView(this.views.toolbarView);
			this._youtubeReady = true;
			applyYoutubeZoom();
		};
		const handleLoadStart = debounce(() => {
			if (!this.mainWindow || !this.loadingView || !this.views) return;
			if (!this.mainWindow.contentView.children?.find((x) => this.loadingView?.webContents && x === this.loadingView)) {
				this.mainWindow.contentView.addChildView(this.loadingView);
			}
			this._youtubeReady = false;
		}, 100);

		serverMain.on("app.loadEnd", handleLoadEnd);
		serverMain.on("app.loadStart", handleLoadStart);
	}
	private setupWindowEvents() {
		if (!this.mainWindow || !this.views) return;
		// synchronous on purpose: a debounced layout lets the views trail the window by several frames
		const layout = () => this.applyLayout();
		this.mainWindow.on("resize", layout);
		this.mainWindow.on("maximize", layout);
		this.mainWindow.on("unmaximize", layout);
		this.mainWindow.on("enter-full-screen", layout);
		this.mainWindow.on("leave-full-screen", layout);
	}
	private computeBounds() {
		const [width, height] = this.mainWindow?.getContentSize() ?? [0, 0];
		return computeViewBounds({ width, height }, { toolbarHeight: TOOLBAR_HEIGHT, htmlFullscreen: this.htmlFullscreen });
	}
	/** The single place that sizes the main window's views. */
	private applyLayout() {
		if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.views) return;

		const { contentView } = this.mainWindow;
		const { toolbarView, youtubeView } = this.views;
		const { toolbar, youtube } = this.computeBounds();
		youtubeView.setBounds(youtube);
		if (!toolbar) {
			if (contentView.children.includes(toolbarView)) contentView.removeChildView(toolbarView);
		} else {
			if (!contentView.children.includes(toolbarView)) {
				contentView.addChildView(toolbarView);
				// keep the loading view above the toolbar while YouTube is still loading
				if (this.loadingView && contentView.children.includes(this.loadingView)) contentView.addChildView(this.loadingView);
			}
			toolbarView.setBounds(toolbar);
		}
		if (this.loadingView) {
			const [width, height] = this.mainWindow.getContentSize();
			this.loadingView.setBounds({ x: 0, y: 0, width, height });
		}
	}
	private async initializeWindowState(bounds: { width: number; height: number }) {
		if (!this.mainWindow || !this.views) return;

		const { state } = await wrapWindowHandler(this.mainWindow, "root", { ...bounds });

		if (state?.maximized) {
			this.mainWindow.maximize();
		} else {
			this.mainWindow.setBounds({ ...state });
			logger.debug("initializeWindowState", state);
		}

		// callWindowListeners(this.mainWindow, "will-resize", state);
		serverMain.emit("app.loadStart");
		logger.debug("windowState", this.mainWindow.getBounds());

		await this.views.youtubeView.webContents.loadURL(defaultUrl).then(() => {
			if (isDevelopment || isProdDebug) {
				this.views!.youtubeView.webContents.openDevTools({ mode: "detach" });
			}

			if (process.platform === "darwin") {
				const bounds = getBoundsWithScaleFactor(this.mainWindow!);
				this.mainWindow!.setBounds({
					width: bounds.width + 1,
				});
				this.mainWindow!.setBounds({
					width: bounds.width - 1,
				});
			}
		});
	}

	getWindow() {
		return this.mainWindow;
	}

	getViews() {
		return this.views;
	}
}
