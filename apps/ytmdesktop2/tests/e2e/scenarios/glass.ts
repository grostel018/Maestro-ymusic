// Themes: the player page background is a cheap pre-blurred artwork; full-page glass is opt-in (themes.glass).
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
	const content = document.querySelector('.content.ytmusic-player-page');
	let before = null;
	if (content) { const cs = getComputedStyle(content, '::before'); before = { image: cs.backgroundImage, filter: cs.filter }; }
	return { bigBackdrop, before };
})()`;

/**
 * A seeded settings file has no store version, so the old migrations run and switch the thumbnail background and
 * blur off. A brand-new install defaults both on; set that state (plus `glass`) through the settings service.
 */
async function setThemes(t: TestApp, glass: boolean) {
	await t.mainEval(`(async () => {
		const s = __YTMD_TEST__.services.getProvider("settings");
		s.set("themes.thumbnailBackground", true); s.set("themes.blur", true); s.set("themes.glass", ${glass});
	})()`);
}

async function onPlayerPage(t: TestApp, glass: boolean): Promise<CdpSession> {
	await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
	await setThemes(t, glass);
	await play(t);
	const yt = await t.view("youtube");
	await waitFor(async () => (await yt.eval<boolean>("!!document.querySelector('.content.ytmusic-player-page')")) || false, 30000, "the player page content");
	return yt;
}

const probe = (yt: CdpSession) => yt.eval<Probe>(PROBE);

export const scenarios: Scenario[] = [
	{
		id: "s4",
		title: "Artwork background is a pre-blurred image; no full-page glass by default",
		run: async (t) => {
			const yt = await onPlayerPage(t, false);
			const p = await waitFor(
				async () => {
					const r = await probe(yt);
					return r.before?.image.startsWith('url("data:image/') ? r : false;
				},
				30000,
				"the player page ::before to use the pre-blurred data: image",
			);
			if (p.before?.filter.includes("blur")) throw new Error(`::before filter still blurs: ${p.before.filter}`);
			if (p.bigBackdrop.length) throw new Error(`full-page backdrop-filter without glass: ${p.bigBackdrop.join(", ")}`);
		},
	},
	{
		id: "s4b",
		title: "themes.glass restores the full-page backdrop-filter",
		run: async (t) => {
			const yt = await onPlayerPage(t, true);
			await waitFor(async () => ((await probe(yt)).bigBackdrop.length > 0) || false, 30000, "a full-page backdrop-filter with themes.glass");
		},
	},
];
