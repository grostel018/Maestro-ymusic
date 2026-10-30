import { platform } from "@electron-toolkit/utils";
import type { LegacyCustomCssConfig } from "@main/trpc/routers/themes/types";
import { normalizeAudio } from "@shared/audio/settings";
import { normalizeLook } from "@shared/theme/look";
import { app } from "electron";
import { Migration } from "electron-conf";
import { readFileSync, rmSync, statSync } from "fs";
import path from "path";
import { migrateAdblockDefaults } from "./adblockMigration";
import type { SettingsStore } from "./service";
import { migrateThemesBackground } from "./themesMigration";

const migrations: Omit<Migration<SettingsStore>, "version">[] = [
	{
		hook(store) {
			const { migratedFromJson } = store.store?.__meta ?? {};
			if (migratedFromJson) return;
			const oldConfigPath = path.resolve(app.getPath("userData"), "app-settings.json");
			if (!statSync(oldConfigPath, { throwIfNoEntry: false })) {
				store.set("__meta.migratedFromJson", true);
				return;
			}
			const oldConfigBody = readFileSync(oldConfigPath, "utf8");
			if (!oldConfigBody) return;
			rmSync(oldConfigPath);
			const oldConfig = JSON.parse(oldConfigBody);
			store.set(oldConfig);
			store.set("__meta.migratedFromJson", true);
		},
	},
	{
		hook(store) {
			store.set("volumeRatio", {
				enabled: true,
				volume: 0.1,
			});
		},
	},
	{
		hook(store) {
			store.set("plugins", {
				bypass_age_restrictions: {
					enabled: true,
				},
			});
		},
	},
	{
		hook(store) {
			store.set("app.enableTaskbarProgress", platform.isWindows);
		},
	},
	{
		hook(store) {
			store.set("customcss.thumbnailBackground", false);
		},
	},
	{
		hook(store) {
			const data = store.store as SettingsStore & { customcss?: LegacyCustomCssConfig };
			if (data.themes && !data.customcss) return;
			const old = data.customcss;
			if (!old) return;

			const defaultPath = path.resolve(app.getPath("documents"), "ytmdesktop", "custom.scss");
			const file = old.scssFile ?? null;
			const isCustom = !!file && path.normalize(file) !== path.normalize(defaultPath);

			store.set("themes", {
				enabled: old.enabled ?? true,
				selected: isCustom ? "custom" : "default",
				customFile: file,
				watching: old.watching ?? false,
				thumbnailBackground: old.thumbnailBackground ?? true,
			});
			store.delete("customcss" as keyof SettingsStore);
		},
	},
	{
		hook(store) {
			const data = store.store as SettingsStore & { app?: { beta?: boolean; channel?: string } };
			if (data.app?.channel === "stable" || data.app?.channel === "beta" || data.app?.channel === "alpha") {
				if ("beta" in (data.app ?? {})) store.delete("app.beta" as keyof SettingsStore);
				return;
			}
			const legacyBeta = !!(data.app as { beta?: boolean } | undefined)?.beta;
			store.set("app.channel", legacyBeta ? "beta" : "stable");
			store.delete("app.beta" as keyof SettingsStore);
		},
	},
	{
		hook(store) {
			store.set("themes.blur", false);
		},
	},
	{
		hook(store) {
			const current = (store.store as SettingsStore)?.player?.deepLinkOpen;
			if (current === "ask" || current === "play") return;
			store.set("player.deepLinkOpen", "ask");
		},
	},
	{
		hook(store) {
			const current = store.store?.lyrics;
      if (current) return;
			store.set("lyrics", {
				enabled: false,
				showTimeCodes: false,
				showEvenIfInexact: true,
				lineBackground: true,
				lineStyle: "fill",
				providers: [
					{ id: "better-lyrics", enabled: true },
					{ id: "unison", enabled: true },
					{ id: "lrclib", enabled: true },
					{ id: "youtube-captions", enabled: true },
				],
				betterLyricsApiKey: "",
				autoOpenTab: true,
				preferWordSync: true,
			});
		},
	},
	{
		hook(store) {
			const current = store.store?.lyrics;
			if (!current) return;

			if ("showWordSync" in current) store.delete("lyrics.showWordSync" as keyof SettingsStore);
			if ("estimateWordTiming" in current) store.delete("lyrics.estimateWordTiming" as keyof SettingsStore);

			const providers = current.providers;
			if (!Array.isArray(providers) || !providers.length) {
				store.set("lyrics.providers", [
					{ id: "better-lyrics", enabled: true },
					{ id: "unison", enabled: true },
					{ id: "lrclib", enabled: true },
					{ id: "youtube-captions", enabled: true },
				]);
				return;
			}

			if (providers.every((item) => item && typeof item === "object" && "id" in item)) return;

			const next = providers
				.map((item) => {
					if (typeof item === "string") return { id: item, enabled: true };
					return null;
				})
				.filter(Boolean);
			if (!next.length) return;
			store.set("lyrics.providers", next as SettingsStore["lyrics"]["providers"]);
		},
	},
	{
		hook(store) {
			const current = (store.store as SettingsStore)?.trayView?.pinned;
			if (typeof current === "boolean") return;
			let pinned = false;
			try {
				const legacyPath = path.resolve(app.getPath("userData"), "tray-view.yml");
				if (statSync(legacyPath, { throwIfNoEntry: false })) {
					const raw = readFileSync(legacyPath, "utf8");
					pinned = /^\s*pinned:\s*true\s*$/m.test(raw);
				}
			} catch {
				pinned = false;
			}
			store.set("trayView.pinned", pinned);
		},
	},
	{
		hook(store) {
			const current = (store.store as SettingsStore)?.lyrics;
			if (!current) return;
			if (typeof current.betterLyricsApiKey !== "string") store.set("lyrics.betterLyricsApiKey", "");
			if (typeof current.autoOpenTab !== "boolean") store.set("lyrics.autoOpenTab", true);
			if (typeof current.preferWordSync !== "boolean") store.set("lyrics.preferWordSync", true);
			// New last-resort provider: append (enabled) for users with an older saved order.
			const providers = Array.isArray(current.providers) ? current.providers : [];
			if (providers.length && !providers.some((p) => p?.id === "youtube-captions")) {
				store.set("lyrics.providers", [...providers, { id: "youtube-captions", enabled: true }]);
			}
		},
	},
	{
		hook(store) {
			const current = (store.store as SettingsStore)?.lyrics as (SettingsStore["lyrics"] & { showProgressBar?: unknown }) | undefined;
			if (!current) return;
			// `showProgressBar` (bool) became `lineStyle`. The old bool drew a constant-rate line fill;
			// the new "fill" only sweeps word-synced lines (line-only songs just highlight), so it is a
			// safe default for everyone rather than mapping true/false individually.
			if ("showProgressBar" in current) store.delete("lyrics.showProgressBar" as keyof SettingsStore);
			if (current.lineStyle !== "highlight" && current.lineStyle !== "bar" && current.lineStyle !== "fill") {
				store.set("lyrics.lineStyle", "fill");
			}
			if (typeof current.lineBackground !== "boolean") store.set("lyrics.lineBackground", true);
		},
	},
	{
		hook(store) {
			// Full-page glass became opt-in (it costs GPU every frame).
			// Superseded by themes.background (below); kept so migration indexes stay stable.
		},
	},
	{
		hook(store) {
			// `ignore-gpu-blocklist` used to be forced on Windows; it is now the opt-in `app.forceGpu`.
			if (typeof (store.store as SettingsStore)?.app?.forceGpu !== "boolean") store.set("app.forceGpu", false);
		},
	},
	{
		hook(store) {
			migrateAdblockDefaults(store);
		},
	},
	{
		hook(store) {
			const identity = (store.store as SettingsStore)?.googleLogin?.identity;
			if (identity !== "firefox" && identity !== "chrome") store.set("googleLogin.identity", "firefox");
		},
	},
	{
		hook(store) {
			migrateThemesBackground(store as never);
		},
	},
	{
		hook(store) {
			const mode = (store.store as { player?: { videoMode?: unknown } })?.player?.videoMode;
			if (mode !== "video" && mode !== "audio") store.set("player.videoMode", "video");
		},
	},
	{
		hook(store) {
			// Phase C2–C4: video controls, keep-pitch and the output device.
			const player = (store.store as { player?: Record<string, unknown> })?.player ?? {};
			if (typeof player.videoControls !== "boolean") store.set("player.videoControls", true);
			if (typeof player.keepPitch !== "boolean") store.set("player.keepPitch", true);
			if (typeof player.outputDevice !== "string" || !player.outputDevice) store.set("player.outputDevice", "default");
		},
	},
	{
		hook(store) {
			// Phase D: the audio lab settings, completed and range-checked.
			store.set("audio", normalizeAudio((store.store as { audio?: unknown })?.audio));
		},
	},
	{
		hook(store) {
			// Game mode, on by default.
			if (typeof (store.store as SettingsStore)?.app?.gameMode !== "boolean") store.set("app.gameMode", true);
		},
	},
	{
		hook(store) {
			// Phase E: the look (palette, accent, corner radius).
			store.set("themes.look", normalizeLook((store.store as { themes?: { look?: unknown } })?.themes?.look));
		},
	},
];

export default migrations;
