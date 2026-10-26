// Bench: settings seeded through launchApp({ settings }) survive startup (the seeded file records the store's migration version).
import type { Scenario } from "../lib/app.ts";
import { waitFor } from "../lib/wait.ts";

type Seen = { hideUpsells: unknown; background: unknown; volume: unknown; taskbar: unknown; version: unknown };

export const scenarios: Scenario[] = [
	{
		id: "s13",
		smoke: true,
		title: "Seeded settings survive startup migrations",
		launch: { settings: {
			adblock: { enabled: true, network: true, prune: true, fallback: true, hideUpsells: false, stats: { total: 0 } },
			// values the legacy hooks overwrite unconditionally (volumeRatio=0.1, enableTaskbarProgress=isWindows), plus a non-default background
			themes: { enabled: true, selected: "default", customFile: null, watching: false, background: "plain" },
			volumeRatio: { enabled: false, volume: 0.5 },
			app: { enableTaskbarProgress: process.platform !== "win32" },
		} },
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.services")) || false, 60000, "the test hooks");
			const seen = await t.mainEval<Seen>(`(() => {
				const s = __YTMD_TEST__.services.getProvider("settings");
				return { hideUpsells: s.get("adblock.hideUpsells"), background: s.get("themes.background"), volume: s.get("volumeRatio.volume"), taskbar: s.get("app.enableTaskbarProgress"), version: s.get("__internal__.migrationVersion") };
			})()`);
			if (seen.hideUpsells !== false) throw new Error(`adblock.hideUpsells was overwritten: ${JSON.stringify(seen)}`);
			if (seen.volume !== 0.5) throw new Error(`volumeRatio was reset by a replayed migration: ${JSON.stringify(seen)}`);
			if (seen.taskbar !== (process.platform !== "win32")) throw new Error(`app.enableTaskbarProgress was reset by a replayed migration: ${JSON.stringify(seen)}`);
			if (typeof seen.version !== "number") throw new Error(`no stored migration version: ${JSON.stringify(seen)}`);
			if (seen.background !== "plain") throw new Error(`themes.background was overwritten: ${JSON.stringify(seen)}`);
		},
	},
];
