import { platform } from "@electron-toolkit/utils";
import { AfterInit, BaseProvider, BeforeStart, OnDestroy } from "@main/core/baseProvider";
import { createPowerHold, type PowerHold } from "@main/domain/powerHold";
import { chromiumSwitches } from "@main/infra/chromiumSwitches";
import { isDevelopment, isProduction } from "@main/infra/devUtils";
import { serverMain } from "@main/ipc/serverEvents";
import SettingsProvider, { readSettings } from "@main/trpc/routers/settings/service";
import IPC_EVENT_NAMES from "@shared/constants/eventNames";
import { App, powerSaveBlocker } from "electron";
import { basename } from "path";

const GTK_VERSION = /^[2-4]+$/.test(process.env.GTK_VERSION ?? "") ? process.env.GTK_VERSION : "3";

export default class StartupProvider extends BaseProvider implements AfterInit, BeforeStart, OnDestroy {
	get settingsInstance(): SettingsProvider {
		return this.getProvider("settings");
	}
	get isEnabled() {
		return !!this.settingsInstance.instance?.app?.autostart;
	}
	get isInitialMinimized() {
		return !!this.settingsInstance.instance?.app?.autostartMinimized;
	}
	private readonly powerHold: PowerHold | null = platform.isMacOS
		? null // app suspension on mac prevents sleep
		: createPowerHold({ start: () => powerSaveBlocker.start("prevent-app-suspension"), stop: (id) => powerSaveBlocker.stop(id) });
	constructor(private app: App) {
		super("startup");
		const { switches, enableFeatures, disableFeatures } = chromiumSwitches({
			platform: process.platform as "win32" | "darwin" | "linux",
			// providers are not registered yet; the settings store is already loaded at import
			forceGpu: !!readSettings()?.app?.forceGpu,
			isDevelopment,
			gtkVersion: GTK_VERSION,
		});
		for (const [name, value] of switches) {
			if (value === undefined) app.commandLine.appendSwitch(name);
			else app.commandLine.appendSwitch(name, value);
		}
		app.commandLine.appendSwitch("enable-features", enableFeatures.join(","));
		app.commandLine.appendSwitch("disable-features", disableFeatures.join(","));
	}
	/** Whether a power-save blocker is held (only while music plays). */
	isPowerHeld() {
		return !!this.powerHold?.isHeld();
	}
	async BeforeStart() {
		if (this.settingsInstance.instance.app.disableHardwareAccel) this.app.disableHardwareAcceleration();
		serverMain.on(IPC_EVENT_NAMES.TRACK_PLAYSTATE, (_ev: unknown, isPlaying: unknown) => this.powerHold?.set(!!isPlaying));
	}
	async OnDestroy() {
		this.powerHold?.set(false);
	}
	private get startArgs() {
		return ["--processStart", `"${basename(process.execPath)}"`, "--startup"];
	}
	get isStartupContext() {
		return !!process.argv.find((arg) => arg === "--startup");
	}
	get isMinimizedArg() {
		return !!process.argv.find((arg) => arg === "--minimized");
	}
	async AfterInit() {
		this.settingsInstance.onSettingChange("app.autostart", (enabled) => void this.onAutoStartToggle("app.autostart", enabled as boolean), {
			debounce: 1000,
		});
		const app = this.settingsInstance.instance.app;
		if (isProduction) {
			if (app.autostart) {
				this.app.setLoginItemSettings({
					openAtLogin: true,
					path: process.execPath,
					args: this.startArgs,
				});
			} else {
				this.app.setLoginItemSettings({
					openAtLogin: false,
					args: this.startArgs,
				});
			}
		}
	}
	private async onAutoStartToggle(key: string, enabled: boolean) {
		// A dev run would register the bare Electron binary at login.
		if (!isProduction) return;
		if (enabled) {
			this.app.setLoginItemSettings({
				openAtLogin: true,
				path: process.execPath,
				args: this.startArgs,
			});
		} else {
			this.app.setLoginItemSettings({
				openAtLogin: false,
				args: this.startArgs,
			});
		}
	}
}
