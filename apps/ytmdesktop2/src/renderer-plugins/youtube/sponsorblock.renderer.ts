import { type Segment, segmentAt } from "@shared/sponsorblock";
import { pageToast } from "./page-toast";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// SponsorBlock for music videos (roadmap G5): skips the non-music parts (intros, skits, outros), sponsor reads and
// self-promotion that SponsorBlock users marked. Music videos only; songs have none. Setting `player.sponsorBlock`.
// Segments come from main (main/trpc/routers/sponsorblock/service.ts), looked up by a hash prefix.

const SETTING = "player.sponsorBlock";
const MAIN_VIDEO = "video.html5-main-video, #movie_player video";

const sponsorBlockRenderer: RendererPluginRegistration = {
	id: "sponsorblock",
	enabled: true,
	start(ctx) {
		let enabled = true;
		let videoId = "";
		let segments: Segment[] = [];
		const told = new Set<string>();

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
			if (enabled && isMusicVideo()) ctx.ytmd?.emit("sponsorblock:request", id);
		};

		const onTime = (e: Event) => {
			const v = e.target;
			if (!enabled || !segments.length || !(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO) || v.paused) return;
			const s = segmentAt(segments, v.currentTime);
			if (!s) return;
			// Skip to the end, but never past the end of the track (YTM then moves on by itself).
			v.currentTime = Math.min(s[1], Math.max(0, v.duration - 0.25));
			const key = `${videoId}:${s[0]}`;
			if (!told.has(key)) {
				told.add(key);
				pageToast("Skipped a non-music part (SponsorBlock)", 2500);
			}
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
		};
	},
};

export default sponsorBlockRenderer;
