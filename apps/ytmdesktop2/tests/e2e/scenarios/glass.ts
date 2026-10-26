// Themes: the whole-window background is a cheap pre-blurred artwork; full-page glass is opt-in (themes.glass).
import type { Scenario, TestApp } from "../lib/app.ts";
import type { CdpSession } from "../lib/cdp.ts";
import { play } from "../lib/perf.ts";
import { waitFor } from "../lib/wait.ts";

type Probe = { bigBackdrop: string[]; before: { image: string; filter: string } | null };

/** Elements (and their ::before/::after) covering more than half the viewport with a backdrop-filter, plus the artwork layer. */
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
	// the artwork layer is body::before (fixed, whole window)
	const cs = getComputedStyle(document.body, '::before');
	const before = cs.content === 'none' ? null : { image: cs.backgroundImage, filter: cs.filter };
	return { bigBackdrop, before };
})()`;

/** Seeded at launch (seeded settings survive startup), so nothing changes while the page loads. */
const themes = (glass: boolean) => ({
	settings: { themes: { enabled: true, selected: "default", customFile: null, watching: false, thumbnailBackground: true, blur: true, glass } },
});

async function onPlayerPage(t: TestApp): Promise<CdpSession> {
	await play(t);
	const yt = await t.view("youtube");
	await waitFor(async () => (await yt.eval<boolean>("!!document.querySelector('.content.ytmusic-player-page')")) || false, 30000, "the player page content");
	return yt;
}

const probe = (yt: CdpSession) => yt.eval<Probe>(PROBE);

export const scenarios: Scenario[] = [
	{
		id: "s4",
		smoke: true,
		title: "Artwork background is a pre-blurred image; no full-page glass by default",
		launch: themes(false),
		run: async (t) => {
			const yt = await onPlayerPage(t);
			const p = await waitFor(
				async () => {
					const r = await probe(yt);
					return r.before?.image.includes('url("data:image/') ? r : false;
				},
				30000,
				"the window background (body::before) to use the pre-blurred data: image",
			);
			if (p.before?.filter.includes("blur")) throw new Error(`::before filter still blurs: ${p.before.filter}`);
			if (p.bigBackdrop.length) throw new Error(`full-page backdrop-filter without glass: ${p.bigBackdrop.join(", ")}`);
			if (await glassInjected(t)) throw new Error("the glass layer is injected although themes.glass is off");
		},
	},
	{
		id: "s4b",
		title: "themes.glass injects the full-page glass stylesheet",
		launch: themes(true),
		run: async (t) => {
			await onPlayerPage(t);
			await waitFor(async () => (await glassInjected(t)) || false, 30000, "the theme service to inject the glass layer");
		},
	},
];

/**
 * Whether the theme service has the glass layer injected into the YouTube view. Asked in the main process:
 * webContents.insertCSS sheets are not visible in document.styleSheets, and YouTube's Video mode overrides the
 * glass layer's computed style, so the page cannot answer this reliably.
 */
function glassInjected(t: TestApp): Promise<boolean> {
	return t.mainEval<boolean>(`!!__YTMD_TEST__.services.getProvider("themes").injector?.has("glass")`);
}
