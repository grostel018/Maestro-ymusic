/** Fork identity: keeps this build isolated from the installed upstream app (profile, lock, scheme, updater). */
export const FORK = {
	appId: "com.maestro.ymusic",
	productName: "Maestro",
	/** electron-builder `extraMetadata.name` of the packaged app. */
	packageName: "maestro",
	/** Windows executable (upstream ships ytmdesktop.exe; the NSIS installer closes running apps by image name). */
	winExecutableName: "maestro",
	/** Keeps its pre-rename value: changing it would lose existing settings and sign-ins. */
	userDataName: "ytmdesktop2-plus",
	scheme: "maestro",
	updatesEnabled: false,
	repoUrl: "https://github.com/grostel018/Maestro-ymusic",
	upstreamName: "ytmdesktop2",
	upstreamAuthor: "Venipa",
	upstreamUrl: "https://github.com/Venipa/ytmdesktop2",
} as const;
