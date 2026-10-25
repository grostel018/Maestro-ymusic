/** Fork identity: keeps this build isolated from the installed upstream app (profile, lock, scheme, updater). */
export const FORK = {
	appId: "com.ytmdesktop2.plus",
	productName: "YTMDesktop2 Plus",
	userDataName: "ytmdesktop2-plus",
	scheme: "ytmdplus",
	updatesEnabled: false,
} as const;
