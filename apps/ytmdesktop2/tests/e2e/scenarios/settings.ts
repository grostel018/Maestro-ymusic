// Bench: settings seeded through launchApp({ settings }) survive startup (the seeded file records the store's migration version).
import type { Scenario } from "../lib/app.ts";
import { waitFor } from "../lib/wait.ts";

type Seen = { hideUpsells: unknown; glass: unknown };

export const scenarios: Scenario[] = [
	{
		id: "s13",
		title: "Seeded settings survive startup migrations",
		launch: { settings: { adblock: { hideUpsells: false }, themes: { glass: true } } },
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.services")) || false, 60000, "the test hooks");
			const seen = await t.mainEval<Seen>(`(() => {
				const s = __YTMD_TEST__.services.getProvider("settings");
				return { hideUpsells: s.get("adblock.hideUpsells"), glass: s.get("themes.glass") };
			})()`);
			if (seen.hideUpsells !== false) throw new Error(`adblock.hideUpsells was overwritten: ${JSON.stringify(seen)}`);
			if (seen.glass !== true) throw new Error(`themes.glass was overwritten: ${JSON.stringify(seen)}`);
		},
	},
];
