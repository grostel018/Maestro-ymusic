/** Fork identity: keeps this build isolated from the installed upstream app (profile, lock, scheme, updater). */
export const FORK = {
	appId: "com.ytmdesktop2.plus",
	productName: "YTMDesktop2 Plus",
	/** electron-builder `extraMetadata.name` of the packaged app. */
	packageName: "ytmdesktop2-plus",
	/** Windows executable (upstream ships ytmdesktop.exe; the NSIS installer closes running apps by image name). */
	winExecutableName: "ytmdesktop-plus",
	userDataName: "ytmdesktop2-plus",
	scheme: "ytmdplus",
	updatesEnabled: false,
} as const;
