export interface ThemesConfig {
	enabled: boolean;
	/** Builtin theme id or "custom" */
	selected: "default" | "custom";
	customFile: string | null;
	watching: boolean;
	/** What fills the window behind everything: the blurred song artwork or a plain dark color. */
	background?: ThemeBackground;
}

export type ThemeBackground = "artwork" | "plain";

export function backgroundMode(config: Pick<ThemesConfig, "background"> | null | undefined): ThemeBackground {
	return config?.background === "plain" ? "plain" : "artwork";
}

/** Legacy settings shape (pre-themes migration). */
export interface LegacyCustomCssConfig {
	enabled: boolean;
	scssFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
}
