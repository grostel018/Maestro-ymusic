import { getAudioEngine } from "./audio-engine/instance";
import { DEFAULT_DEVICE, outputMenu, resolveSink } from "./audio-output.logic";
import { pageToast, removePageToast } from "./page-toast";
import { openMenu, setIcon } from "./video-controls.menu";
import type { RendererPluginRegistration } from "./world0/types";

// Audio output device (roadmap C3): a player-bar menu of the system's outputs, applied with `setSinkId` on the
// player's media element and on the audio engine's context (D1), which carries the sound once a stage is on. Main allows device listing for this page only
// and never grants capture (main/lib/mediaPermissions.ts). A device that disappears falls back to the default,
// with a toast; it is used again when it comes back.

const SETTING = "player.outputDevice";
const BUTTON_ID = "ytmd-output-button";
const STYLE_ID = "ytmd-output-style";
// Material "speaker" (a device), so it does not read as a second volume button.
const ICON =
	"M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-5 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 16a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";

const CSS = `
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
	border-radius: 50%; color: rgba(255, 255, 255, 0.7); }
#${BUTTON_ID}:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BUTTON_ID}[data-custom] { color: #fff; }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BUTTON_ID} svg { width: 22px; height: 22px; fill: currentColor; }
`;

const audioOutputRenderer: RendererPluginRegistration = {
	id: "audio-output",
	enabled: true,
	start(ctx) {
		let wanted = DEFAULT_DEVICE;
		/** The device we already told the user about, so a hot-plug storm toasts once. */
		let toldMissing = "";
		let applying: Promise<void> = Promise.resolve();

		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			(document.head ?? document.documentElement).appendChild(style);
		}

		const devices = async () => {
			try {
				return await navigator.mediaDevices.enumerateDevices();
			} catch (err) {
				ctx.log.warn("enumerateDevices failed", err);
				return [];
			}
		};

		const apply = () => {
			applying = applying.then(async () => {
				const { sinkId, missing } = resolveSink(wanted, await devices());
				if (missing && toldMissing !== wanted) {
					toldMissing = wanted;
					pageToast("The chosen audio output is not connected. Playing on the default device.");
				}
				if (!missing) toldMissing = "";
				getAudioEngine().setSink(sinkId);
				for (const video of document.querySelectorAll("video")) {
					if (video.sinkId === sinkId) continue;
					try {
						await video.setSinkId(sinkId);
					} catch (err) {
						ctx.log.warn("setSinkId failed", err);
						if (sinkId) await video.setSinkId("").catch(() => undefined);
					}
				}
				render();
			});
			return applying;
		};

		const render = () => {
			const btn = document.getElementById(BUTTON_ID);
			if (!btn) return;
			btn.toggleAttribute("data-custom", wanted !== DEFAULT_DEVICE);
		};

		const choose = (deviceId: string) => {
			wanted = deviceId;
			ctx.ytmd?.settings.set(SETTING, deviceId);
			void apply();
		};

		const mount = () => {
			if (document.getElementById(BUTTON_ID)) return;
			const anchor = document.getElementById("ytmd-speed-button") ?? document.getElementById("ytmd-av-bar-button");
			if (!anchor?.parentElement) return;
			const btn = document.createElement("button");
			btn.id = BUTTON_ID;
			btn.type = "button";
			btn.title = "Audio output";
			btn.setAttribute("aria-label", "Audio output");
			setIcon(btn, ICON);
			btn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const list = outputMenu(await devices());
				const current = list.some((d) => d.deviceId === wanted) ? wanted : DEFAULT_DEVICE;
				openMenu(
					btn,
					"Audio output",
					list.map((d) => ({ label: d.label, checked: d.deviceId === current, onSelect: () => choose(d.deviceId) })),
				);
			});
			anchor.insertAdjacentElement("afterend", btn);
			render();
		};

		const onDeviceChange = () => void apply();
		// A new media element (or source) starts on the default sink; put it back on ours.
		const onSource = (e: Event) => {
			const sinkTarget = e.target as HTMLMediaElement;
			if (wanted !== DEFAULT_DEVICE && sinkTarget.sinkId !== wanted) void apply();
		};
		navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
		document.addEventListener("loadeddata", onSource, true);

		const setWanted = (value: unknown) => {
			const next = typeof value === "string" && value ? value : DEFAULT_DEVICE;
			if (next === wanted) return;
			wanted = next;
			void apply();
		};
		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === SETTING) setWanted(value);
				else if (key === "player") setWanted((value as { outputDevice?: unknown } | null)?.outputDevice);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get(SETTING))
			.then(setWanted)
			.catch(() => undefined);

		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);
		mount();

		return () => {
			window.clearInterval(remount);
			offSettings();
			navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
			document.removeEventListener("loadeddata", onSource, true);
			document.getElementById(BUTTON_ID)?.remove();
			removePageToast();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default audioOutputRenderer;
