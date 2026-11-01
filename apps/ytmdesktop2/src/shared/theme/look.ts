// Theme engine (roadmap E1): palette presets, accent and corner radius, compiled to CSS variables over YouTube
// Music's own color variables. Shared by main (injects the page CSS), the title bar (same base color) and the
// settings page (swatches, import/export). Palette colors follow well-known editor themes (their spicetify-themes
// ports, MIT); the token names and the YTM variable mapping are ours.

export type ThemeTokens = { base: string; surface: string; text: string; subtext: string; accent: string };
export type AccentSource = "palette" | "song" | string;
export type CornerRadius = "square" | "soft" | "round";
export type BackgroundMode = "artwork" | "plain" | "video" | "color";

export type Look = {
	palette: string;
	/** "palette" (the palette's accent), "song" (the playing song's color) or a #rrggbb color. */
	accent: AccentSource;
	radius: CornerRadius;
	/** Tokens from an imported .ytmdtheme.json, used when `palette` is "imported". */
	imported: (ThemeTokens & { name: string }) | null;
};

export const PALETTES: Array<{ id: string; name: string; tokens: ThemeTokens }> = [
	{ id: "youtube", name: "YouTube Music", tokens: { base: "#030303", surface: "#212121", text: "#ffffff", subtext: "#aaaaaa", accent: "#ff0033" } },
	{ id: "black", name: "Pure black", tokens: { base: "#000000", surface: "#121212", text: "#ffffff", subtext: "#9e9e9e", accent: "#ff0033" } },
	{ id: "dracula", name: "Dracula", tokens: { base: "#282a36", surface: "#44475a", text: "#f8f8f2", subtext: "#bfbfd9", accent: "#bd93f9" } },
	{ id: "nord", name: "Nord", tokens: { base: "#2e3440", surface: "#3b4252", text: "#eceff4", subtext: "#c0c8d6", accent: "#88c0d0" } },
	{ id: "catppuccin", name: "Catppuccin Mocha", tokens: { base: "#1e1e2e", surface: "#313244", text: "#cdd6f4", subtext: "#a6adc8", accent: "#cba6f7" } },
	{ id: "gruvbox", name: "Gruvbox", tokens: { base: "#282828", surface: "#3c3836", text: "#ebdbb2", subtext: "#bdae93", accent: "#fe8019" } },
	{ id: "tokyo-night", name: "Tokyo Night", tokens: { base: "#1a1b26", surface: "#24283b", text: "#c0caf5", subtext: "#9aa5ce", accent: "#7aa2f7" } },
	{ id: "rose-pine", name: "Rosé Pine", tokens: { base: "#191724", surface: "#26233a", text: "#e0def4", subtext: "#908caa", accent: "#ebbcba" } },
	{ id: "solarized", name: "Solarized Dark", tokens: { base: "#002b36", surface: "#073642", text: "#eee8d5", subtext: "#93a1a1", accent: "#b58900" } },
	{ id: "monokai", name: "Monokai", tokens: { base: "#272822", surface: "#3e3d32", text: "#f8f8f2", subtext: "#cfcfc2", accent: "#a6e22e" } },
	{ id: "everforest", name: "Everforest", tokens: { base: "#2d353b", surface: "#3d484d", text: "#d3c6aa", subtext: "#9da9a0", accent: "#a7c080" } },
	{ id: "kanagawa", name: "Kanagawa", tokens: { base: "#1f1f28", surface: "#2a2a37", text: "#dcd7ba", subtext: "#a6a69c", accent: "#7e9cd8" } },
	{ id: "ayu", name: "Ayu Dark", tokens: { base: "#0f1419", surface: "#1c2329", text: "#e6e1cf", subtext: "#b3b1ad", accent: "#ffb454" } },
	{ id: "github-dark", name: "GitHub Dark", tokens: { base: "#0d1117", surface: "#161b22", text: "#e6edf3", subtext: "#8b949e", accent: "#2f81f7" } },
	{ id: "sakura", name: "Sakura", tokens: { base: "#1f1a24", surface: "#2e2433", text: "#f5e6ef", subtext: "#c9a9bf", accent: "#ff79c6" } },
	{ id: "ocean", name: "Ocean", tokens: { base: "#0b1622", surface: "#13263a", text: "#e3f2fd", subtext: "#90a4ae", accent: "#29b6f6" } },
	{ id: "light", name: "Light", tokens: { base: "#ffffff", surface: "#f2f2f2", text: "#0f0f0f", subtext: "#606060", accent: "#cc0000" } },
	{ id: "catppuccin-latte", name: "Catppuccin Latte", tokens: { base: "#eff1f5", surface: "#dce0e8", text: "#4c4f69", subtext: "#5c5f77", accent: "#8839ef" } },
	{ id: "solarized-light", name: "Solarized Light", tokens: { base: "#fdf6e3", surface: "#eee8d5", text: "#073642", subtext: "#586e75", accent: "#268bd2" } },
	{ id: "github-light", name: "GitHub Light", tokens: { base: "#ffffff", surface: "#f6f8fa", text: "#1f2328", subtext: "#656d76", accent: "#0969da" } },
	{ id: "rose-pine-dawn", name: "Rosé Pine Dawn", tokens: { base: "#faf4ed", surface: "#f2e9e1", text: "#575279", subtext: "#6e6a86", accent: "#b4637a" } },
];

/** Relative luminance of a #rrggbb color (WCAG). */
export function luminance(hex: string): number {
	const channel = (i: number) => {
		const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** A light look: judged from the base color, so an imported light theme counts too. */
export const isLightLook = (look: Look): boolean => luminance(lookTokens(look).base) > 0.4;

export const DEFAULT_LOOK: Look = { palette: "youtube", accent: "palette", radius: "soft", imported: null };

const HEX = /^#[0-9a-f]{6}$/i;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Tokens from untrusted JSON (an imported theme), or null when a color is missing or malformed. */
export function readTokens(raw: unknown): (ThemeTokens & { name: string }) | null {
	const t = obj(raw);
	const keys = ["base", "surface", "text", "subtext", "accent"] as const;
	if (!keys.every((k) => typeof t[k] === "string" && HEX.test(t[k] as string))) return null;
	const name = typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 40) : "Imported";
	return { name, base: t.base as string, surface: t.surface as string, text: t.text as string, subtext: t.subtext as string, accent: t.accent as string };
}

export function normalizeLook(raw: unknown): Look {
	const l = obj(raw);
	const imported = readTokens(l.imported);
	const known = typeof l.palette === "string" && (PALETTES.some((p) => p.id === l.palette) || (l.palette === "imported" && !!imported));
	const palette = known ? (l.palette as string) : DEFAULT_LOOK.palette;
	const accent = l.accent === "palette" || l.accent === "song" || (typeof l.accent === "string" && HEX.test(l.accent)) ? (l.accent as string) : DEFAULT_LOOK.accent;
	const radius = l.radius === "square" || l.radius === "soft" || l.radius === "round" ? l.radius : DEFAULT_LOOK.radius;
	return { palette, accent, radius, imported };
}

export function lookTokens(look: Look): ThemeTokens {
	if (look.palette === "imported" && look.imported) return look.imported;
	return (PALETTES.find((p) => p.id === look.palette) ?? PALETTES[0]).tokens;
}

export const RADIUS_PX: Record<CornerRadius, number> = { square: 0, soft: 8, round: 16 };

/** The accent as CSS: a fixed color, or the song's color (track-theme sets --ytmd-thumbnail-accent) over the palette's. */
export function accentCss(look: Look): string {
	const t = lookTokens(look);
	if (look.accent === "song") return `var(--ytmd-thumbnail-accent, ${t.accent})`;
	if (look.accent !== "palette" && HEX.test(look.accent)) return look.accent;
	return t.accent;
}

/** A semi-transparent version of a color (works with var() too). */
export const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** The page CSS: our tokens, then YouTube Music's own variables pointed at them. */
export function lookCss(look: Look): string {
	const t = lookTokens(look);
	const accent = accentCss(look);
	const r = RADIUS_PX[look.radius];
	const light = isLightLook(look);
	const vars: Array<[string, string]> = [
		["--ytmd-veil-pct", `${veilPct(look)}%`],
		["--ytmd-base", t.base],
		["--ytmd-surface", t.surface],
		["--ytmd-text", t.text],
		["--ytmd-subtext", t.subtext],
		["--ytmd-accent", accent],
		["--ytmd-radius", `${r}px`],
		["--ytmusic-general-background-a", t.base],
		["--ytmusic-general-background-b", t.base],
		["--ytmusic-general-background-c", t.surface],
		["--ytmusic-brand-background-solid", t.base],
		["--ytmusic-brand-background-translucent", mix(t.base, 85)],
		["--ytmusic-text-primary", t.text],
		["--ytmusic-text-secondary", t.subtext],
		["--ytmusic-color-white1", t.text],
		["--yt-spec-general-background-a", t.base],
		["--yt-spec-general-background-b", t.base],
		["--yt-spec-general-background-c", t.surface],
		["--yt-spec-menu-background", t.surface],
		["--yt-spec-raised-background", t.surface],
		["--yt-spec-text-primary", t.text],
		["--yt-spec-text-secondary", t.subtext],
		["--yt-spec-static-brand-red", accent],
		["--yt-spec-brand-button-background", accent],
		["--yt-spec-call-to-action", accent],
		["--paper-slider-active-color", accent],
		["--paper-slider-knob-color", accent],
		["--paper-toggle-button-checked-bar-color", accent],
		["--paper-toggle-button-checked-button-color", accent],
		["--paper-checkbox-checked-color", accent],
		...(light ? lightVars(t) : []),
	];
	const decl = vars.map(([k, v]) => `${k}: ${v} !important;`).join(" ");
	return `html, html[dark], ytmusic-app, ytmusic-app-layout { ${decl} }
tp-yt-paper-listbox, ytmusic-menu-popup-renderer, ytmusic-multi-page-menu-renderer { background-color: ${t.surface} !important; }
#progress-bar.ytmusic-player-bar, tp-yt-paper-slider#progress-bar { --paper-progress-active-color: ${accent} !important; }
ytmusic-two-row-item-renderer img, ytmusic-responsive-list-item-renderer img, ytmusic-player #song-image img, ytmusic-player-bar img.image,
ytmusic-thumbnail-renderer, .thumbnail.ytmusic-player-bar, ytmusic-player #song-image {
	border-radius: ${r}px !important; overflow: hidden; }
${light ? LIGHT_CSS : ""}`;
}

/** How much of the base color lies over the artwork: text is dark on a light look and needs more of it. */
const veilPct = (look: Look) => (isLightLook(look) ? 82 : 62);

/** YouTube Music only ships dark colors; these are the ones the dark set hard-codes as white or near-white. */
function lightVars(t: ThemeTokens): Array<[string, string]> {
	const line = (pct: number) => mix(t.text, pct);
	return [
		["--ytmusic-overlay-text-primary", t.text],
		["--ytmusic-overlay-text-secondary", t.subtext],
		["--ytmusic-color-white1-alpha70", mix(t.text, 70)],
		["--ytmusic-color-white1-alpha50", mix(t.text, 50)],
		["--ytmusic-color-white1-alpha30", mix(t.text, 30)],
		["--ytmusic-color-white1-alpha20", mix(t.text, 20)],
		["--ytmusic-color-white1-alpha15", mix(t.text, 15)],
		["--ytmusic-color-white1-alpha10", mix(t.text, 10)],
		["--ytmusic-divider", line(12)],
		["--ytmusic-guide-divider", line(12)],
		["--ytmusic-search-background", t.surface],
		["--ytmusic-nav-bar", t.base],
		["--ytmusic-player-bar-background", t.base],
		["--ytmusic-player-bar-ink-color", t.text],
		["--ytmusic-setting-item-toggle-active", t.accent],
		["--iron-icon-fill-color", t.text],
		["--yt-endpoint-color", t.text],
		["--yt-endpoint-hover-color", t.text],
		["--yt-endpoint-visited-color", t.text],
		["--yt-spec-icon-active-other", t.text],
		["--yt-spec-icon-inactive", t.subtext],
		["--yt-spec-icon-disabled", mix(t.text, 30)],
		["--yt-spec-text-disabled", mix(t.text, 40)],
		["--yt-spec-10-percent-layer", line(10)],
		["--yt-spec-badge-chip-background", line(6)],
		["--yt-spec-button-chip-background-hover", line(10)],
		["--yt-spec-suggested-action", line(8)],
		["--yt-spec-touch-response", t.text],
		["--paper-slider-container-color", line(20)],
		["--paper-slider-secondary-color", line(30)],
	];
}

/** Where the variables don't reach; the full-screen player and things over pictures stay light-on-dark. */
const LIGHT_CSS = `
ytmusic-app ytmusic-player-bar, ytmusic-app ytmusic-nav-bar, ytmusic-app ytmusic-guide-renderer, ytmusic-app ytmusic-player-page tp-yt-paper-tabs { color: var(--ytmd-text) !important; }
ytmusic-app :is(ytmusic-player-bar, ytmusic-nav-bar, ytmusic-guide-renderer, ytmusic-responsive-list-item-renderer, ytmusic-player-queue-item, ytmusic-menu-renderer, ytmusic-section-list-renderer) :is(yt-icon, .yt-icon-shape, tp-yt-iron-icon, yt-icon-button, tp-yt-paper-icon-button, button):not(ytmusic-play-button-renderer *) { color: var(--ytmd-text) !important; fill: currentColor; }
ytmusic-app ytmusic-player-page tp-yt-paper-tab { color: var(--ytmd-subtext) !important; --paper-tab-ink: var(--ytmd-text); }
ytmusic-app ytmusic-player-page tp-yt-paper-tab[aria-selected="true"], ytmusic-app ytmusic-player-page tp-yt-paper-tab.iron-selected { color: var(--ytmd-text) !important; }
ytmusic-app ytmusic-chip-cloud-chip-renderer a, ytmusic-app ytmusic-chip-cloud-chip-renderer yt-formatted-string { color: var(--ytmd-text) !important; }
ytmusic-app ytmusic-chip-cloud-chip-renderer a { background: color-mix(in srgb, var(--ytmd-text) 7%, transparent) !important; }
ytmusic-app ytmusic-chip-cloud-chip-renderer[chip-style="STYLE_LARGE_TRANSLUCENT_AND_SELECTED_WHITE"] a, ytmusic-app ytmusic-chip-cloud-chip-renderer[is-selected] a, ytmusic-app ytmusic-chip-cloud-chip-renderer[chip-style="STYLE_PRIMARY"] a { background: var(--ytmd-text) !important; }
ytmusic-app ytmusic-chip-cloud-chip-renderer[chip-style="STYLE_LARGE_TRANSLUCENT_AND_SELECTED_WHITE"] :is(a, yt-formatted-string), ytmusic-app ytmusic-chip-cloud-chip-renderer[is-selected] :is(a, yt-formatted-string), ytmusic-app ytmusic-chip-cloud-chip-renderer[chip-style="STYLE_PRIMARY"] :is(a, yt-formatted-string) { color: var(--ytmd-base) !important; }
ytmusic-app ytmusic-search-box input { color: var(--ytmd-text) !important; }
/* The redesigned player bar (an A/B test) and its design-system buttons paint their own white. */
ytmusic-app :is(ytmusic-player-bar, ytmusic-miniplayer) :is(.ytAttributedStringHost, .ytSpecButtonShapeNextButtonTextContent, button, a, svg, path, .ytIconWrapperHost, yt-formatted-string, span):not(ytmusic-play-button-renderer *) { color: var(--ytmd-text) !important; --yt-spec-text-primary: var(--ytmd-text); }
ytmusic-app :is(ytmusic-player-bar, ytmusic-miniplayer) :is(.ytSpecButtonShapeNextTonal, .yt-spec-button-shape-next--tonal) { background: color-mix(in srgb, var(--ytmd-text) 7%, transparent) !important; }
ytmusic-app ytmusic-player-page .ytAttributedStringHost, ytmusic-app ytmusic-section-list-renderer .ytAttributedStringHost, ytmusic-app ytmusic-player-page .ytSpecButtonShapeNextButtonTextContent { color: var(--ytmd-text) !important; }
/* The wordmark is a white image; inverting and turning the hue back keeps the red play mark red. */
ytmusic-nav-bar img.logo, ytmusic-nav-bar picture img, ytmusic-nav-bar .logo { filter: invert(1) hue-rotate(180deg) saturate(3) brightness(0.8) !important; }
ytmusic-app ytmusic-guide-entry-renderer[active] tp-yt-paper-item, ytmusic-app ytmusic-guide-entry-renderer:hover tp-yt-paper-item { background: color-mix(in srgb, var(--ytmd-text) 8%, transparent) !important; }
ytmusic-app ytmusic-app-layout[player-fullscreened] > :is(ytmusic-player-bar, ytmusic-miniplayer), ytmusic-app ytmusic-app-layout[player-fullscreened] > :is(ytmusic-player-bar, ytmusic-miniplayer) * { color: #fff !important; --ytmusic-text-primary: #fff; --ytmusic-text-secondary: rgba(255, 255, 255, 0.7); --yt-endpoint-color: #fff; --iron-icon-fill-color: #fff; }
ytmusic-app-layout[player-fullscreened] > #player-bar-background { background: rgba(0, 0, 0, 0.6) !important; }
`;

/** Title-bar colors that continue the page surface for this look. */
export function titleBarColors(look: Look): { base: string; veil: string; tint: string } {
	const base = lookTokens(look).base;
	return { base, veil: mix(base, veilPct(look)), tint: mix(base, 28) };
}

/** An exportable .ytmdtheme.json for the current look. */
export function exportLook(look: Look): string {
	const t = lookTokens(look);
	const accent = look.accent !== "palette" && look.accent !== "song" ? look.accent : t.accent;
	const name = look.palette === "imported" && look.imported ? look.imported.name : (PALETTES.find((p) => p.id === look.palette)?.name ?? "Theme");
	return JSON.stringify({ name, ...t, accent, radius: look.radius }, null, 2);
}
