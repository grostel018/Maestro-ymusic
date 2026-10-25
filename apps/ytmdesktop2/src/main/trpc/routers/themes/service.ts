import { AfterInit, BaseProvider } from "@main/core/baseProvider";
import { onMusicReload } from "@main/lifecycle";
import SettingsProvider from "@main/trpc/routers/settings/service";
import chromeBlurScss from "@main/trpc/routers/themes/assets/chrome/blur.scss?raw";
import chromeGlassScss from "@main/trpc/routers/themes/assets/chrome/glass.scss?raw";
import chromeScrollbarScss from "@main/trpc/routers/themes/assets/chrome/scrollbar.scss?raw";
import chromeThumbnailScss from "@main/trpc/routers/themes/assets/chrome/thumbnail-bg.scss?raw";
import type { App } from "electron";
import fs from "fs";
import { debounce } from "lodash-es";
import path from "path";
import { ThemeCompiler } from "./compiler";
import { CssInjector } from "./injector";
import { BUNDLED_THEMES, defaultThemeScss, listThemes, resolveActiveSource } from "./registry";
import type { ThemesConfig } from "./types";

export type { ThemesConfig } from "./types";
export { listThemes };

export default class ThemesProvider extends BaseProvider implements AfterInit {
	private fileWatcher: fs.FSWatcher | null = null;
	private readonly compiler = new ThemeCompiler();
	private injector: CssInjector | null = null;
	private chromeCss: string | null = null;
	private thumbnailCss: string | null = null;
	private blurCss: string | null = null;
	private glassCss: string | null = null;
	private readonly DEBOUNCE_DELAY = 1000;
	private reapplyChain: Promise<void> = Promise.resolve();

	get settingsInstance(): SettingsProvider {
		return this.getProvider("settings");
	}

	constructor(private app: App) {
		super("themes");
	}

	private getDefaultCustomPath(): string {
		return path.resolve(this.app.getPath("documents"), "ytmdesktop", "custom.scss");
	}

	private getConfig(): ThemesConfig {
		return (
			this.settingsInstance.get<ThemesConfig>("themes") ?? {
				enabled: true,
				selected: "default",
				customFile: null,
				watching: false,
				thumbnailBackground: true,
				blur: true,
				glass: false,
			}
		);
	}

private boundWebContentsId: number | null = null;

	private getInjector(): CssInjector | null {
		const webContents = this.windowContext?.views?.youtubeView?.webContents;
		if (!webContents || webContents.isDestroyed()) return null;
		if (!this.injector || this.boundWebContentsId !== webContents.id) {
			this.injector = new CssInjector(webContents);
			this.boundWebContentsId = webContents.id;
		}
		return this.injector;
	}

	private async ensureChromeCompiled(): Promise<void> {
		if (!this.chromeCss) {
			this.chromeCss = await this.compiler.compileString(chromeScrollbarScss, "chrome:scrollbar");
		}
		if (!this.thumbnailCss) {
			this.thumbnailCss = await this.compiler.compileString(chromeThumbnailScss, "chrome:thumbnail");
		}
		if (!this.blurCss) {
			this.blurCss = await this.compiler.compileString(chromeBlurScss, "chrome:blur");
		}
		if (!this.glassCss) {
			this.glassCss = await this.compiler.compileString(chromeGlassScss, "chrome:glass");
		}
	}

	private closeWatcher(): void {
		if (this.fileWatcher) {
			this.fileWatcher.close();
			this.fileWatcher = null;
		}
	}

	private syncWatcher(): void {
		this.closeWatcher();
		const config = this.getConfig();
		if (!config.enabled || config.selected !== "custom" || !config.watching || !config.customFile) {
			return;
		}
		this.setupFileWatcher(config.customFile);
	}

	private setupFileWatcher(scssPath: string): void {
		this.closeWatcher();
		try {
			const debouncedUpdate = debounce(async () => {
				this.logger.debug(`Theme file changed: ${scssPath}`);
				await this.updateTheme(true);
			}, this.DEBOUNCE_DELAY);

			const watchDir = path.dirname(scssPath);
			this.fileWatcher = fs.watch(watchDir, (_eventType, filename) => {
				if (filename === path.basename(scssPath)) {
					debouncedUpdate();
				}
			});

			this.fileWatcher.on("error", (error) => {
				this.logger.error(`File watcher error: ${error.message}`);
				this.fileWatcher = null;
			});

			this.logger.debug(`Watching theme file: ${scssPath}`);
		} catch (error: any) {
			this.logger.error(`Failed to setup file watcher: ${error?.message || "Unknown error"}`);
			this.fileWatcher = null;
		}
	}

	async updateTheme(bypassCache = false): Promise<boolean> {
		const config = this.getConfig();
		const injector = this.getInjector();
		if (!injector) return false;

		if (!config.enabled) {
			await injector.clear("theme");
			return false;
		}

		const source = resolveActiveSource(config);
		if (!source) {
			await injector.clear("theme");
			return false;
		}

		const css =
			source.type === "string"
				? await this.compiler.compileString(source.value, `theme:${source.id}`, bypassCache)
				: await this.compiler.compileFile(source.value, bypassCache);

		if (!css) return false;

		this.logger.debug(`Injecting theme [${source.id}]${bypassCache ? " (cache bypassed)" : ""}`);
		return injector.inject("theme", css);
	}

	/** Force recompile + inject (Reload / tRPC). */
	async requestUpdate(): Promise<void> {
		await this.updateTheme(true);
	}

	async reapplyAllStyles(): Promise<void> {
		this.reapplyChain = this.reapplyChain
			.catch(() => undefined)
			.then(async () => {
				// Fresh injector after document reload — old insertCSS keys are stale.
				this.injector = null;
				this.boundWebContentsId = null;
				const injector = this.getInjector();
				if (!injector) return;

				await this.ensureChromeCompiled();
				if (this.chromeCss) await injector.inject("chrome", this.chromeCss);

				const config = this.getConfig();
				const thumbnailOn = config.thumbnailBackground ?? true;
				if (thumbnailOn && this.thumbnailCss) {
					await injector.inject("thumbnail", this.thumbnailCss);
				}

				const blurOn = config.blur ?? true;
				if (blurOn && this.blurCss) {
					await injector.inject("blur", this.blurCss);
				}

				if (config.glass && this.glassCss) {
					await injector.inject("glass", this.glassCss);
				}

				if (config.enabled) await this.updateTheme();
			});
		return this.reapplyChain;
	}

	private async applyThumbnail(enabled: boolean): Promise<void> {
		const injector = this.getInjector();
		if (!injector) return;
		await this.ensureChromeCompiled();
		if (enabled && this.thumbnailCss) await injector.inject("thumbnail", this.thumbnailCss);
		else await injector.clear("thumbnail");
		// Glass filters the thumbnail ::before — re-inject after so its filter wins the cascade.
		if (this.getConfig().glass) await this.applyGlass(true);
	}

	private async applyGlass(enabled: boolean): Promise<void> {
		const injector = this.getInjector();
		if (!injector) return;
		await this.ensureChromeCompiled();
		if (enabled && this.glassCss) await injector.inject("glass", this.glassCss);
		else await injector.clear("glass");
	}

	private async applyBlur(enabled: boolean): Promise<void> {
		const injector = this.getInjector();
		if (!injector) return;
		await this.ensureChromeCompiled();
		if (enabled && this.blurCss) await injector.inject("blur", this.blurCss);
		else await injector.clear("blur");
	}

	private async onThemesSettingChange(_value: unknown, _prev: unknown, key: string): Promise<void> {
		const config = this.getConfig();
		this.logger.debug(`Themes setting changed: ${key}`);

		if (key === "themes.thumbnailBackground") {
			await this.applyThumbnail(!!config.thumbnailBackground);
			return;
		}

		if (key === "themes.blur") {
			await this.applyBlur(!!config.blur);
			return;
		}

		if (key === "themes.glass") {
			await this.applyGlass(!!config.glass);
			return;
		}

		this.syncWatcher();

		if (!config.enabled) {
			const injector = this.getInjector();
			await injector?.clear("theme");
			return;
		}

		if (config.selected === "custom") {
			await this.ensureCustomFile();
		}

		await this.updateTheme(true);
	}

	/**
	 * When Custom is selected and no file exists, seed Documents custom.scss.
	 * Never flips `enabled`.
	 */
	private async ensureCustomFile(): Promise<string | null> {
		const config = this.getConfig();
		const customPath = config.customFile ?? this.getDefaultCustomPath();
		const parent = path.dirname(customPath);

		try {
			if (!fs.existsSync(customPath)) {
				if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
				fs.writeFileSync(customPath, defaultThemeScss);
				this.logger.debug(`Created default custom theme file at ${customPath}`);
			}
			if (!config.customFile) {
				this.settingsInstance.set("themes.customFile", customPath);
			}
			return customPath;
		} catch (error: any) {
			this.logger.error(`Failed to ensure custom theme file: ${error?.message || "Unknown error"}`);
			return null;
		}
	}

	async AfterInit() {
		await this.ensureChromeCompiled();

		this.settingsInstance.onSettingChange(
			["themes.enabled", "themes.selected", "themes.customFile", "themes.watching", "themes.thumbnailBackground", "themes.blur", "themes.glass"],
			(value, prev, key) => void this.onThemesSettingChange(value, prev, key),
			{ debounce: 1000 },
		);

		const config = this.getConfig();
		if (config.enabled && config.selected === "custom") {
			await this.ensureCustomFile();
		}

		this.syncWatcher();
		await this.reapplyAllStyles();
	}

	getBundledThemeIds(): string[] {
		return Object.keys(BUNDLED_THEMES);
	}
}

onMusicReload(async (ctx) => {
	const themes = ctx.getProvider("themes") as ThemesProvider | undefined;
	if (themes) await themes.reapplyAllStyles();
});
