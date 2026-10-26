// Between scenarios that share one launch: put the window and the player back to a known state.
import type { TestApp } from "./app.ts";
import { sleep } from "./wait.ts";

const WIN = "__YTMD_TEST__.getMainWindow().main";

/** Restore → leave fullscreen → normal size 1500x800, exit HTML fullscreen, pause playback. */
export async function resetApp(t: TestApp): Promise<void> {
	await t.mainEval(`(() => {
		const w = ${WIN};
		if (w.isMinimized()) w.restore();
		if (!w.isVisible()) w.show();
		if (w.isFullScreen()) w.setFullScreen(false);
		if (w.isMaximized()) w.unmaximize();
		w.setSize(1500, 800);
	})()`);
	const yt = await t.view("youtube");
	await yt.eval(
		`(async () => {
			if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
			document.querySelector("#movie_player")?.pauseVideo?.();
		})()`,
		{ userGesture: true },
	);
	await sleep(300);
}
