import { getAudioEngine } from "./audio-engine/instance";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// Precise volume (roadmap D4): the mouse wheel over the player bar moves the volume in 1 % steps, with a small
// readout. Idea from pear-desktop@7c55260:src/plugins/precise-volume (MIT); written for our player bar.
// Setting `audio.volumeWheel` (read through the audio engine, which holds the `audio` settings).

const HUD_ID = "ytmd-volume-hud";
const HUD_MS = 1200;

const volumeWheelRenderer: RendererPluginRegistration = {
	id: "volume-wheel",
	enabled: true,
	start() {
		let hideTimer = 0;
		const hud = (pct: number) => {
			let el = document.getElementById(HUD_ID);
			if (!el) {
				el = document.createElement("div");
				el.id = HUD_ID;
				el.setAttribute("role", "status");
				Object.assign(el.style, {
					position: "fixed",
					right: "24px",
					bottom: "84px",
					zIndex: "2147483000",
					padding: "6px 12px",
					borderRadius: "8px",
					background: "rgba(28, 28, 28, 0.92)",
					color: "#fff",
					font: '500 13px/1.2 "YouTube Sans", Roboto, sans-serif',
					pointerEvents: "none",
				});
				document.body.appendChild(el);
			}
			el.textContent = `Volume ${pct}%`;
			window.clearTimeout(hideTimer);
			hideTimer = window.setTimeout(() => document.getElementById(HUD_ID)?.remove(), HUD_MS);
		};

		const onWheel = (e: WheelEvent) => {
			if (!getAudioEngine().getState().audio.volumeWheel || !e.deltaY) return;
			const target = e.target as Element | null;
			if (!target?.closest?.("ytmusic-player-bar")) return;
			const player = getPagePlayerApi();
			if (!player) return;
			e.preventDefault();
			e.stopPropagation();
			const step = e.deltaY < 0 ? 1 : -1;
			const next = Math.min(100, Math.max(0, Math.round(player.getVolume()) + step));
			player.setVolume(next);
			if (next > 0 && player.isMuted?.()) player.unMute?.();
			hud(next);
		};
		document.addEventListener("wheel", onWheel, { capture: true, passive: false });

		return () => {
			document.removeEventListener("wheel", onWheel, { capture: true });
			window.clearTimeout(hideTimer);
			document.getElementById(HUD_ID)?.remove();
		};
	},
};

export default volumeWheelRenderer;
