export type ChromiumSwitchOptions = {
	platform: "win32" | "darwin" | "linux";
	/** `app.forceGpu`: render on the GPU even when Chromium blocklists the driver. */
	forceGpu: boolean;
	isDevelopment: boolean;
	gtkVersion?: string;
};

export type ChromiumSwitches = {
	switches: Array<[string, string?]>;
	enableFeatures: string[];
	disableFeatures: string[];
};

/**
 * Keep renderers (esp. the YouTube WebContentsView) off Chromium background/occlusion throttling.
 * Measured with these removed (bench p6/p7, 2026-10-25): paused+minimized CPU 0.26 % vs 0.25 % with
 * them, and minimized playback passed either way, so they stay (see spec §8). App views still rest
 * per view: only the YouTube view sets `backgroundThrottling: false`.
 */
export const BACKGROUNDING_SWITCHES = ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"];

/** Process-wide Chromium switches, applied by `StartupProvider` before the app is ready. */
export function chromiumSwitches(o: ChromiumSwitchOptions): ChromiumSwitches {
	const switches: Array<[string, string?]> = [];
	if (o.platform === "win32") switches.push(["enable-gpu-rasterization"]); // may fix large playlist / ui only hang issue
	if (o.forceGpu) switches.push(["ignore-gpu-blocklist"]);
	for (const name of BACKGROUNDING_SWITCHES) switches.push([name]);
	if (o.isDevelopment) switches.push(["disable-web-security"]);
	// OS HiDPI / deviceScaleFactor (Retina, Windows 125%/150%). Do not force-device-scale-factor —
	// that freezes layout at 1× and breaks high-DPI. Page zoom for app chrome is locked separately.
	switches.push(["high-dpi-support", "1"]);
	if (o.platform === "linux") {
		if (o.gtkVersion) switches.push(["gtk-version", o.gtkVersion]);
		switches.push(["ozone-platform-hint", "auto"]);
	}
	const enableFeatures = ["OverlayScrollbar", "FluentOverlayScrollbar", "CanvasOopRasterization", "SharedArrayBuffer"];
	if (o.platform === "linux") enableFeatures.push("UseOzonePlatform", "WaylandWindowDecorations", "GlobalShortcutsPortal");
	const disableFeatures = [
		"CalculateNativeWinOcclusion", // the fourth backgrounding/occlusion switch, kept with the three above
		"IntensiveWakeUpThrottling",
		"UseEcoQoSForBackgroundProcess",
		"MediaSessionService", // xosms / OS media keys — keep out of Chromium MediaSession
	];
	return { switches, enableFeatures, disableFeatures };
}
