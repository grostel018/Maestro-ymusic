// Themes: the whole window (title bar included) is one surface: a pre-blurred artwork ("artwork") or a flat
// color ("plain"), chosen by themes.background.
import type { Scenario, TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { waitFor } from "../lib/wait.ts";

type Probe = { bigBackdrop: string[]; before: { image: string; filter: string } | null; contentOpacity: string | null; playerOpen: boolean };

/** Big backdrop-filters (costly), the artwork layer (body::before), and whether the browse page is hidden under the player. */
const PROBE = `(() => {
	const half = innerWidth * innerHeight * 0.5;
	const bigBackdrop = [];
	for (const el of document.querySelectorAll('*')) {
		const r = el.getBoundingClientRect();
		if (r.width * r.height <= half) continue;
		for (const pseudo of [null, '::before', '::after']) {
			const cs = getComputedStyle(el, pseudo);
			const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
			if (bf !== 'none') bigBackdrop.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (pseudo || '') + ' ' + bf);
		}
	}
	const cs = getComputedStyle(document.body, '::before');
	const before = cs.content === 'none' ? null : { image: cs.backgroundImage, filter: cs.filter };
	const layout = document.querySelector('ytmusic-app-layout');
	const content = document.querySelector('ytmusic-app-layout > #content');
	return { bigBackdrop, before, contentOpacity: content ? getComputedStyle(content).opacity : null, playerOpen: !!layout?.hasAttribute('player-page-open') };
})()`;

const themes = (background: "artwork" | "plain") => ({
	settings: { themes: { enabled: true, selected: "default", customFile: null, watching: false, background } },
});

async function onPlayerPage(t: TestApp): Promise<CdpSession> {
	await play(t);
	const yt = await t.view("youtube");
	await waitFor(async () => (await yt.eval<boolean>("!!document.querySelector('.content.ytmusic-player-page')")) || false, 30000, "the player page content");
	return yt;
}

const probe = (yt: CdpSession) => yt.eval<Probe>(PROBE);
const hasArtwork = (p: Probe) => !!p.before?.image.includes('url("data:image/');
const toolbarImage = async (t: TestApp) =>
	(await t.view("toolbar")).eval<string>(`[...document.querySelectorAll('div')].map((d) => getComputedStyle(d).backgroundImage).find((b) => b.includes('data:image/')) || ''`);

export const scenarios: Scenario[] = [
	{
		id: "s4",
		smoke: true,
		title: "One surface: pre-blurred artwork behind the page and the title bar; browse page hidden under the player",
		launch: themes("artwork"),
		run: async (t) => {
			const yt = await onPlayerPage(t);
			const p = await waitFor(async () => {
				const r = await probe(yt);
				return hasArtwork(r) ? r : false;
			}, 30000, "the window background (body::before) to use the pre-blurred data: image");
			if (p.before?.filter.includes("blur")) throw new Error(`::before filter still blurs: ${p.before.filter}`);
			if (p.bigBackdrop.length) throw new Error(`full-page backdrop-filter: ${p.bigBackdrop.join(", ")}`);
			if (p.playerOpen && p.contentOpacity !== "0") throw new Error(`browse page shows through the player page (opacity ${p.contentOpacity})`);
			await waitFor(async () => (await toolbarImage(t)) || false, 15000, "the title bar to paint the same pre-blurred artwork");
			if (!(await t.mainEval<boolean>(`!!__YTMD_TEST__.services.getProvider("themes").injector?.has("surface")`))) throw new Error("surface layer not injected");
		},
	},
	{
		id: "s4b",
		title: "Background 'plain' paints no artwork; switching to 'artwork' brings it back live",
		launch: themes("plain"),
		run: async (t) => {
			const yt = await onPlayerPage(t);
			await waitFor(async () => (await t.mainEval<boolean>(`!!__YTMD_TEST__.services.getProvider("themes").injector?.has("surface")`)) || false, 30000, "the surface layer");
			if (hasArtwork(await probe(yt))) throw new Error("plain background still paints the artwork");
			if (await toolbarImage(t)) throw new Error("plain title bar still paints the artwork");
			await t.mainEval(`(__YTMD_TEST__.services.getProvider("settings").set("themes.background", "artwork"), true)`);
			await waitFor(async () => hasArtwork(await probe(yt)) || false, 30000, "the artwork after switching to 'artwork'");
		},
	},
];
