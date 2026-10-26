// Ad block: the network layer (Ghostery engine on the default session) blocks ad and tracker requests (s5);
// the prune layer strips ad payloads from YouTube's responses in the page before the player reads them (s6).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Scenario } from "../lib/app.ts";
import { AD_SHOWING, play } from "../lib/perf.ts";
import { sleep, waitFor } from "../lib/wait.ts";

/** YouTube's watch-history and playback-stats pings; the history allow-list in engine.ts keeps them unblocked. */
const HISTORY_URL = /youtube\.com\/api\/stats\/(watchtime|playback)\b/;
const BLOCKED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "results", "s5-blocked-urls.txt");
const AD_URL = /doubleclick\.net|googlesyndication|\/pagead\/|\/api\/stats\/ads/;
const CURRENT_TIME = "document.querySelector('video')?.currentTime ?? 0";
const AD_KEYS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
const STATS = "__YTMD_TEST__.services.getProvider('adblock').stats()";

export const scenarios: Scenario[] = [
	{
		id: "s5",
		smoke: true,
		title: "Network blocking: ad and tracker requests fail with ERR_BLOCKED_BY_CLIENT, history pings pass and playback advances",
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
			const historyBlocked = blocked.filter((u) => HISTORY_URL.test(u));
			const historySeen = [...urls.values()].filter((u) => HISTORY_URL.test(u)).length;
			// every blocked URL goes to the log and to results/, so a tracker list that starts eating history pings shows up
			fs.writeFileSync(BLOCKED_FILE, `${blocked.join("\n")}\n`);
			console.log(`  s5: ${blocked.length} blocked (${adHits.length} ad URLs), ${historySeen} history/playback-stats requests sent, stats ${JSON.stringify(stats)}, playback advanced ${advanced.toFixed(2)} s in 10 s`);
			for (const u of blocked) console.log(`    blocked: ${u.slice(0, 200)}`);
			console.log(`    blocked URL list: ${BLOCKED_FILE}`);
			if (historyBlocked.length) throw new Error(`watch-history / playback-stats pings were blocked: ${historyBlocked.join(", ")}`);
			if (!adHits.length) throw new Error(`no ad URL failed with ERR_BLOCKED_BY_CLIENT (blocked: ${blocked.slice(0, 5).join(", ") || "none"})`);
			if (advanced < 8) throw new Error(`playback advanced only ${advanced.toFixed(2)} s in 10 s (need >= 8)`);
			if (!(stats.session > 0)) throw new Error(`adblock.stats session count is ${stats.session}`);
			// the all-time count is written at most once a minute, so this one comes from the flush on quit
			const final = await t.mainEval<{ total: number }>(STATS);
			await t.quit();
			const saved = (parse(fs.readFileSync(path.join(t.profileDir, "app-settings.yml"), "utf8")) as { adblock?: { stats?: { total?: number } } }).adblock?.stats?.total;
			console.log(`    stats.total on disk after quit: ${saved} (in memory before quit: ${final.total})`);
			if (!(typeof saved === "number" && saved >= final.total)) throw new Error(`adblock.stats.total on disk is ${saved} after quit, expected >= ${final.total}`);
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
	{
		id: "s7",
		smoke: true,
		reuse: true,
		title: "Fallback skipper: ad-showing mutes the video at 16x within 1 s and removing it restores both",
		launch: { settings: { adblock: { enabled: true, network: true, prune: true, fallback: true, hideUpsells: true, stats: { total: 0 } } } },
		run: async (t) => {
			const yt = await t.view("youtube");
			await play(t);
			const read = () => yt.eval<{ muted: boolean; rate: number }>("(() => { const v = document.querySelector('video'); return { muted: v.muted, rate: v.playbackRate }; })()");
			const before = await read();
			const statsBefore = await t.mainEval<{ session: number }>(STATS);
			await yt.eval("document.querySelector('#movie_player').classList.add('ad-showing')");
			const startedAt = Date.now();
			await waitFor(async () => {
				const s = await read();
				return (s.muted === true && s.rate === 16) || false;
			}, 1000, "the video muted at 16x within 1 s of ad-showing");
			const sped = Date.now() - startedAt;
			await yt.eval("document.querySelector('#movie_player').classList.remove('ad-showing')");
			await waitFor(async () => {
				const s = await read();
				return (s.muted === before.muted && s.rate === before.rate) || false;
			}, 1000, "muted and playbackRate restored within 1 s of ad-showing leaving");
			// second ad: YTM can swap the <video> element mid-ad, the replacement must be restored too
			await yt.eval("document.querySelector('#movie_player').classList.add('ad-showing')");
			await waitFor(async () => (await read()).muted || false, 1000, "the second ad muted");
			await yt.eval(`(() => { const old = document.querySelector('video'); const n = old.cloneNode(false); n.id = 'ytmd-swapped'; old.after(n); old.remove(); n.playbackRate = 1.25; })()`);
			await waitFor(async () => (await yt.eval<boolean>("(() => { const v = document.querySelector('video'); return v.id === 'ytmd-swapped' && v.muted && v.playbackRate === 16; })()")) || false, 1000, "the swapped video muted at 16x");
			await yt.eval("document.querySelector('#movie_player').classList.remove('ad-showing')");
			await waitFor(async () => (await yt.eval<boolean>("(() => { const v = document.querySelector('video'); return v.id === 'ytmd-swapped' && !v.muted && v.playbackRate === 1.25; })()")) || false, 1000, "the swapped video restored (unmuted, 1.25x)");
			const statsAfter = await t.mainEval<{ session: number }>(STATS);
			console.log(`  s7: before ${JSON.stringify(before)}, muted at 16x after ${sped} ms, restored, skipped counted +${statsAfter.session - statsBefore.session}`);
			if (!(statsAfter.session > statsBefore.session)) throw new Error(`stats.session did not rise (${statsBefore.session} -> ${statsAfter.session})`);
		},
	},
	{
		id: "s8",
		title: "Upsell hiding: promo and enforcement elements are display none, visible once hideUpsells is off",
		launch: { settings: { adblock: { enabled: true, network: true, prune: true, fallback: true, hideUpsells: true, stats: { total: 0 } } } },
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
			const yt = await t.view("youtube");
			await waitFor(async () => (await yt.eval<boolean>("!!document.querySelector('ytmusic-app')")) || false, 60000, "ytmusic-app");
			const TAGS = ["ytmusic-mealbar-promo-renderer", "ytmusic-enforcement-message-view-model"];
			await yt.eval(`(() => { for (const tag of ${JSON.stringify(TAGS)}) { const e = document.createElement(tag); e.id = 'ytmd-test-' + tag; e.textContent = 'x'; document.querySelector('ytmusic-app').appendChild(e); } })()`);
			const displays = () => yt.eval<string[]>(`${JSON.stringify(TAGS)}.map((tag) => getComputedStyle(document.getElementById('ytmd-test-' + tag)).display)`);
			await waitFor(async () => ((await displays()).every((d) => d === "none")) || false, 3000, "upsell elements to be display none");
			await t.mainEval("__YTMD_TEST__.services.getProvider('settings').set('adblock.hideUpsells', false) && undefined");
			await waitFor(async () => ((await displays()).every((d) => d !== "none")) || false, 3000, "upsell elements to show with hideUpsells off");
			console.log(`  s8: hidden while on, shown after hideUpsells=false (${(await displays()).join(", ")})`);
		},
	},
	{
		id: "s12",
		title: "Settings page: the five ad block switches show the seeded values and the stats line renders",
		launch: { settings: { adblock: { enabled: true, network: true, prune: false, fallback: true, hideUpsells: false, stats: { total: 7 } } } },
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
			await t.mainEval("__YTMD_TEST__.services.getProvider('app').openSettingsWindow().then(() => true)");
			// the settings window is a hash-routed page of the renderer; the toolbar view lives under #/youtube/
			const page = await t.view(/#\/(?!youtube)/);
			await page.eval("location.hash = '#/player/adblock'");
			const labels = ["Block ads", "Block ad servers", "Remove ads from YouTube responses", "Skip ads that slip through", "Hide Premium pop-ups"];
			const READ = `(() => {
				const out = {};
				for (const f of document.querySelectorAll('[data-slot="field"]')) {
					const sw = f.querySelector('[role="switch"]');
					if (sw && !sw.disabled) out[f.querySelector('label')?.textContent.trim() ?? ''] = sw.getAttribute('aria-checked') === 'true';
				}
				return out;
			})()`;
			await waitFor(async () => (Object.keys(await page.eval<Record<string, boolean>>(READ)).length >= labels.length) || false, 15000, "the five ad block switches to load their values");
			await waitFor(async () => (Number(/All time: (\d+)/.exec(await page.eval<string>("document.body.innerText"))?.[1] ?? 0) >= 7) || false, 15000, "the stats line to show an all-time total of at least the seeded 7");
			const seen = await page.eval<Record<string, boolean>>(READ);
			const want: Record<string, boolean> = { "Block ads": true, "Block ad servers": true, "Remove ads from YouTube responses": false, "Skip ads that slip through": true, "Hide Premium pop-ups": false };
			const wrong = labels.filter((l) => seen[l] !== want[l]);
			const text = await page.eval<string>("document.body.innerText");
			const stats = /Blocked this session: \d+ · All time: \d+/.exec(text)?.[0];
			const badges = (text.match(/Restart required/g) ?? []).length;
			const shot = (await page.call("Page.captureScreenshot", { format: "png" })) as { data: string };
			const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "results", "s12-adblock-settings.png");
			fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
			console.log(`  s12: switches ${JSON.stringify(seen)}, stats "${stats}", ${badges} restart badges, screenshot ${file}`);
			if (wrong.length) throw new Error(`switches differ from the seeded values: ${wrong.join(", ")}`);
			if (!stats) throw new Error(`no "Blocked this session: N" stats line in: ${text.slice(0, 300)}`);
			// only the prune layer needs a restart; the master switch says so for its pruning part
			if (badges !== 1) throw new Error(`expected 1 "Restart required" badge (Remove ads from YouTube responses), saw ${badges}`);
			if (!/removing ads from YouTube responses stops after a restart/i.test(text)) throw new Error(`no restart note under "Block ads" in: ${text.slice(0, 400)}`);
		},
	},
];
