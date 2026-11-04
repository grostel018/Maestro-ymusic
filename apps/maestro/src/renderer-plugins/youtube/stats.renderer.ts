import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// Listening stats (roadmap G3): every 15 s, the seconds actually played (from the video's clock, so pauses, seeks
// and ads don't count) go to main (main/trpc/routers/stats/service.ts), which adds them up on this machine.

const REPORT_MS = 15_000;
const MAIN_VIDEO = "video.html5-main-video, #movie_player video";

const statsRenderer: RendererPluginRegistration = {
	id: "stats",
	enabled: true,
	start(ctx) {
		let lastId = "";
		let lastTime = 0;
		let played = 0;

		const flush = () => {
			const data = getPagePlayerApi()?.getVideoData?.() as { video_id?: string; title?: string; author?: string } | undefined;
			if (played >= 1 && data?.video_id && data.title) {
				ctx.ytmd?.emit("stats:listen", { videoId: data.video_id, title: data.title, artist: data.author ?? "", seconds: Math.round(played) });
			}
			played = 0;
		};

		const onTime = (e: Event) => {
			const v = e.target;
			if (!(v instanceof HTMLVideoElement) || !v.matches(MAIN_VIDEO)) return;
			if (document.querySelector("#movie_player")?.classList.contains("ad-showing")) {
				lastTime = v.currentTime;
				return;
			}
			const id = (getPagePlayerApi()?.getVideoData?.() as { video_id?: string } | undefined)?.video_id ?? "";
			if (id !== lastId) {
				flush();
				lastId = id;
				lastTime = v.currentTime;
				return;
			}
			const step = v.currentTime - lastTime;
			lastTime = v.currentTime;
			// Only steady playback: a seek jumps, a pause doesn't move. Listening time is wall time, so speed counts.
			if (step > 0 && step < 2) played += step / (v.playbackRate || 1);
		};

		const timer = window.setInterval(flush, REPORT_MS);
		document.addEventListener("timeupdate", onTime, true);

		return () => {
			flush();
			window.clearInterval(timer);
			document.removeEventListener("timeupdate", onTime, true);
		};
	},
};

export default statsRenderer;
