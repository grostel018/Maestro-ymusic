import { type Segment, segmentAt } from "@shared/sponsorblock";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// SponsorBlock for music videos (roadmap G5): skips the non-music parts (intros, skits, outros) that SponsorBlock
// users marked. Music videos only; songs have none. Each skip shows a toast with Undo (back to the part, not skipped
// again this play) and Turn off (the `player.sponsorBlock` setting).
// Segments come from main (main/trpc/routers/sponsorblock/service.ts), looked up by a hash prefix.

const SETTING = "player.sponsorBlock";
const MAIN_VIDEO = "video.html5-main-video, #movie_player video";
const TOAST_ID = "ytmd-sb-toast";
const TOAST_MS = 6000;
const TOAST_CSS = `position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 2147483000; display: flex; align-items: center; gap: 12px;
	padding: 8px 10px 8px 16px; border-radius: 10px; background: rgba(28, 28, 28, 0.96); color: #fff; font: 400 13px/1.3 "YouTube Sans", Roboto, sans-serif;
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);`;

const sponsorBlockRenderer: RendererPluginRegistration = {
	id: "sponsorblock",
	enabled: true,
	start(ctx) {
		let enabled = true;
		let videoId = "";
		let segments: Segment[] = [];
		/** Parts the user asked back with Undo: not skipped again for this video. */
		const kept = new Set<string>();

		const toast = (segment: Segment, v: HTMLVideoElement) => {
			document.getElementById(TOAST_ID)?.remove();
			const el = document.createElement("div");
			el.id = TOAST_ID;
			el.setAttribute("role", "status");
			el.style.cssText = TOAST_CSS;
			const text = document.createElement("span");
			text.textContent = "Skipped a non-music part (SponsorBlock)";
			const button = (label: string, onClick: () => void) => {
				const b = document.createElement("button");
				b.type = "button";
				b.textContent = label;
				b.style.cssText = "all: unset; cursor: pointer; padding: 4px 10px; border-radius: 6px; font-weight: 600; background: rgba(255,255,255,.12);";
				b.addEventListener("click", (e) => {
					e.stopPropagation();
					onClick();
					el.remove();
				});
				return b;
			};
			el.append(
				text,
				button("Undo", () => {
					kept.add(`${videoId}:${segment[0]}`);
					v.currentTime = segment[0];
				}),
				button("Turn off", () => {
					enabled = false;
					ctx.ytmd?.settings.set(SETTING, false);
					v.currentTime = segment[0];
				}),
			);
			document.body.appendChild(el);
			window.setTimeout(() => el.remove(), TOAST_MS);
		};

		const isMusicVideo = () => {
			try {
				const type = (getPagePlayerApi()?.getPlayerResponse?.() as { videoDetails?: { musicVideoType?: string } } | undefined)?.videoDetails?.musicVideoType ?? "";
				return type !== "MUSIC_VIDEO_TYPE_ATV" && !type.includes("PODCAST");
			} catch {
				return false;
			}
		};

		const onLoaded = (e: Event) => {
			const v = e.target;
			if (!(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO)) return;
			if (document.querySelector("#movie_player")?.classList.contains("ad-showing")) return;
			const id = (getPagePlayerApi()?.getVideoData?.() as { video_id?: string } | undefined)?.video_id ?? "";
			if (!id || id === videoId) return;
			videoId = id;
			segments = [];
			kept.clear();
			if (enabled && isMusicVideo()) ctx.ytmd?.emit("sponsorblock:request", id);
		};

		const onTime = (e: Event) => {
			const v = e.target;
			if (!enabled || !segments.length || !(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO) || v.paused) return;
			const s = segmentAt(segments, v.currentTime);
			if (!s || kept.has(`${videoId}:${s[0]}`)) return;
			// Skip to the end, but never past the end of the track (YTM then moves on by itself).
			v.currentTime = Math.min(s[1], Math.max(0, v.duration - 0.25));
			toast(s, v);
		};

		const offSegments =
			ctx.ytmd?.on("sponsorblock:segments", (payload) => {
				const r = payload as { videoId?: string; segments?: Segment[] } | null;
				if (r?.videoId === videoId && Array.isArray(r.segments)) segments = r.segments;
			}) ?? (() => undefined);
		const setEnabled = (value: unknown) => {
			enabled = value !== false;
		};
		const offSettings =
			ctx.ytmd?.on("settingsProvider.change", (key, value) => {
				if (key === SETTING) setEnabled(value);
				else if (key === "player") setEnabled((value as { sponsorBlock?: unknown } | null)?.sponsorBlock);
			}) ?? (() => undefined);
		void Promise.resolve(ctx.ytmd?.settings.get(SETTING))
			.then(setEnabled)
			.catch(() => undefined);

		document.addEventListener("loadeddata", onLoaded, true);
		document.addEventListener("timeupdate", onTime, true);

		return () => {
			offSegments();
			offSettings();
			document.removeEventListener("loadeddata", onLoaded, true);
			document.removeEventListener("timeupdate", onTime, true);
			document.getElementById(TOAST_ID)?.remove();
		};
	},
};

export default sponsorBlockRenderer;
