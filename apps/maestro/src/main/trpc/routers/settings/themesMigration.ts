const LEGACY_KEYS = ["thumbnailBackground", "blur", "glass"] as const;

/**
 * The thumbnail / blur / glass toggles became one choice, `themes.background` ("artwork" | "plain").
 * Turning the thumbnail background off meant "plain"; blur and glass are now part of the surface itself.
 */
export function migrateThemesBackground(store: { store: unknown; set(key: string, v: unknown): void; delete(key: string): void }): void {
	const themes = (store.store as { themes?: Record<string, unknown> } | undefined)?.themes;
	if (themes?.background !== "artwork" && themes?.background !== "plain") {
		store.set("themes.background", themes?.thumbnailBackground === false ? "plain" : "artwork");
	}
	for (const key of LEGACY_KEYS) {
		if (themes && key in themes) store.delete(`themes.${key}`);
	}
}
