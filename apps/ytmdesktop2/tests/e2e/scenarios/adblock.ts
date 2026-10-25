// Ad block: the network layer (Ghostery engine on the default session) blocks ad and tracker requests (s5);
// the prune layer strips ad payloads from YouTube's responses in the page before the player reads them (s6).
import type { Scenario } from "../lib/app.ts";
import { AD_SHOWING, play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

const AD_URL = /doubleclick\.net|googlesyndication|\/pagead\/|\/api\/stats\/ads/;
const CURRENT_TIME = "document.querySelector('video')?.currentTime ?? 0";
const AD_KEYS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
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
	{
		id: "s6",
		title: "Response pruning: the player response has no ad keys, the pruned count rises and no ad shows for 60 s",
		// network and fallback off so only the prune layer can keep ads away
		launch: { settings: { adblock: { enabled: true, network: false, prune: true, fallback: false, hideUpsells: true, stats: { total: 0 } } } },
		run: async (t) => {
			const yt = await t.view("youtube");
			const adPollsWhileStarting = await play(t, { skipAds: false });
			const keys = await yt.eval<string[]>(
				`(() => { const r = document.querySelector('#movie_player').getPlayerResponse() || {}; return ${JSON.stringify(AD_KEYS)}.filter((k) => k in r); })()`,
			);
			const pruned = await yt.eval<number>("window.__YTMD_ADBLOCK__?.pruned ?? -1");
			let adSamples = 0;
			const samples = 120;
			for (let i = 0; i < samples; i++) {
				if (await yt.eval<boolean>(AD_SHOWING)) adSamples++;
				await sleep(500);
			}
			console.log(`  s6: pruned ${pruned}, ad keys left ${JSON.stringify(keys)}, ad-showing ${adPollsWhileStarting} polls while starting, ${adSamples}/${samples} samples over 60 s`);
			if (keys.length) throw new Error(`getPlayerResponse() still has ${keys.join(", ")}`);
			if (!(pruned > 0)) throw new Error(`window.__YTMD_ADBLOCK__.pruned is ${pruned}`);
			if (adPollsWhileStarting) throw new Error(`#movie_player had ad-showing in ${adPollsWhileStarting} polls before the track played`);
			if (adSamples) throw new Error(`#movie_player had ad-showing in ${adSamples} of ${samples} samples`);
		},
	},
];
