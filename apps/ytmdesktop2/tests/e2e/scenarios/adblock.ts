// Ad block: the network layer (Ghostery engine on the default session) blocks ad and tracker requests.
import type { Scenario } from "../lib/app.ts";
import { play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

const AD_URL = /doubleclick\.net|googlesyndication|\/pagead\/|\/api\/stats\/ads/;
const CURRENT_TIME = "document.querySelector('video')?.currentTime ?? 0";
const STATS = "__YTMD_TEST__.services.getProvider('adblock').stats()";

export const scenarios: Scenario[] = [
	{
		id: "s5",
		title: "Network blocking: ad and tracker requests fail with ERR_BLOCKED_BY_CLIENT and playback advances",
		launch: { settings: { adblock: { enabled: true, network: true, prune: true, fallback: true, hideUpsells: true, stats: { total: 0 } } } },
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
			const yt = await t.view("youtube");
			const urls = new Map<string, string>();
			const blocked: string[] = [];
			yt.on("Network.requestWillBeSent", (p) => urls.set(p.requestId, p.request.url));
			yt.on("Network.loadingFailed", (p) => {
				if (p.errorText === "net::ERR_BLOCKED_BY_CLIENT") blocked.push(urls.get(p.requestId) ?? "(unknown url)");
			});
			await yt.call("Network.enable");
			await play(t);
			const before = await yt.eval<number>(CURRENT_TIME);
			await sleep(10000);
			const advanced = (await yt.eval<number>(CURRENT_TIME)) - before;
			const stats = await t.mainEval<{ session: number; total: number }>(STATS);
			const adHits = blocked.filter((u) => AD_URL.test(u));
			console.log(`  s5: ${blocked.length} blocked (${adHits.length} ad URLs), stats ${JSON.stringify(stats)}, playback advanced ${advanced.toFixed(2)} s in 10 s`);
			for (const u of adHits.slice(0, 5)) console.log(`    blocked: ${u.slice(0, 160)}`);
			if (!adHits.length) throw new Error(`no ad URL failed with ERR_BLOCKED_BY_CLIENT (blocked: ${blocked.slice(0, 5).join(", ") || "none"})`);
			if (advanced < 8) throw new Error(`playback advanced only ${advanced.toFixed(2)} s in 10 s (need >= 8)`);
			if (!(stats.session > 0)) throw new Error(`adblock.stats session count is ${stats.session}`);
		},
	},
];
