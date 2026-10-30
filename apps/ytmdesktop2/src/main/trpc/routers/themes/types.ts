export interface ThemesConfig {
	enabled: boolean;
	/** Builtin theme id or "custom" */
	selected: "default" | "custom";
	customFile: string | null;
	watching: boolean;
	/** What fills the window behind everything: the blurred song artwork or a plain dark color. */
	background?: ThemeBackground;
	/** Palette, accent and corner radius (shared/theme/look.ts). */
	look?: unknown;
}

/** artwork: blurred song cover; plain: one color; video: the playing video, sampled and blurred (ambient), over the
 * artwork; color: a gradient from the song's color. */
export type ThemeBackground = "artwork" | "plain" | "video" | "color";

export function backgroundMode(config: Pick<ThemesConfig, "background"> | null | undefined): ThemeBackground {
	const b = config?.background;
	return b === "plain" || b === "video" || b === "color" ? b : "artwork";
}

/** Legacy settings shape (pre-themes migration). */
export interface LegacyCustomCssConfig {
	enabled: boolean;
	scssFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
}
