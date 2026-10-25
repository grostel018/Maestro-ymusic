import { PORTS, type Scenario } from "../lib/app.ts";
import { listTargets } from "../lib/cdp.ts";
import { waitFor } from "../lib/wait.ts";

export const scenarios: Scenario[] = [
	{
		id: "s1",
		title: "Boots into music.youtube.com on an isolated profile",
		run: async (t) => {
			await waitFor(async () => (await listTargets(PORTS.cdp)).find((x) => x.url.startsWith("https://music.youtube.com/")) ?? false, 60000, "a music.youtube.com target");
			// toolbar + YouTube; the loading view is removed once YouTube has loaded
			await waitFor(
				async () => (await t.mainEval<number>("__YTMD_TEST__.getMainWindow().main.contentView.children.length")) === 2,
				60000,
				"the loading view to be replaced by toolbar + YouTube",
			);
			const userData = await t.mainEval<string>("process.mainModule.require('electron').app.getPath('userData')");
			if (userData !== t.profileDir) throw new Error(`userData is ${userData}, expected ${t.profileDir}`);
		},
	},
];
