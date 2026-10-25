export interface ThemesConfig {
	enabled: boolean;
	/** Builtin theme id or "custom" */
	selected: "default" | "custom";
	customFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
	/** Blur on the player bar, dialogs and menus. */
	blur?: boolean;
	/** Full-page glass (player page backdrop-filter and blur over the artwork); GPU heavy, off by default. */
	glass?: boolean;
}

/** Legacy settings shape (pre-themes migration). */
export interface LegacyCustomCssConfig {
	enabled: boolean;
	scssFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
}
