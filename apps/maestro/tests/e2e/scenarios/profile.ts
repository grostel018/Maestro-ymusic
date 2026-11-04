// Profile isolation: launched without --user-data-dir, the app picks the fork folder before any store opens, so
// app-settings.yml, the credential/auth stores and their key files never land in the upstream app's folder.
// The run is isolated with YTMD_E2E_APPDATA (and APPDATA) pointing at a folder of the bench's work dir.
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { FORK } from "../../../src/shared/fork.ts";
import { getWorkDir, type Scenario } from "../lib/app.ts";
import { waitFor } from "../lib/wait.ts";

/** Folders the upstream app (and an unflagged dev run of it) use; only listed, never written. */
const REAL_APPDATA = process.env.APPDATA ?? "";
const UPSTREAM_DIRS = ["ytmdesktop2", "YouTube Music for Desktop"].map((n) => path.join(REAL_APPDATA, n));

/** Top-level names, sizes and mtimes of a folder (read-only); `null` when it does not exist. */
function snapshot(dir: string): string | null {
	if (!fs.existsSync(dir)) return null;
	return fs
		.readdirSync(dir)
		.sort()
		.map((n) => {
			const st = fs.statSync(path.join(dir, n), { throwIfNoEntry: false });
			return `${n}:${st?.size ?? "?"}:${st?.mtimeMs ?? "?"}`;
		})
		.join("\n");
}

let appData = "";
let upstreamBefore: Array<string | null> = [];

export const scenarios: Scenario[] = [
	{
		id: "s15",
		smoke: true,
		title: "Without --user-data-dir the settings and credential stores land in the fork's own folder",
		launch: () => {
			appData = path.join(getWorkDir(), "appdata");
			upstreamBefore = UPSTREAM_DIRS.map(snapshot);
			// seeded so the defaults (autostart, error tracing) never run; the app must still pick this folder itself
			return { userDataFlag: false, profileDir: path.join(appData, FORK.userDataName), env: { YTMD_E2E_APPDATA: appData, APPDATA: appData } };
		},
		run: async (t) => {
			await waitFor(async () => (await t.mainEval<boolean>("!!globalThis.__YTMD_TEST__?.getMainWindow()?.views?.youtubeView")) || false, 60000, "the test hooks and main window");
			const paths = await t.mainEval<{ userData: string; appData: string }>(
				"(() => { const { app } = process.mainModule.require('electron'); return { userData: app.getPath('userData'), appData: app.getPath('appData') }; })()",
			);
			if (path.resolve(paths.userData).toLowerCase() !== path.resolve(t.profileDir).toLowerCase()) throw new Error(`userData is ${paths.userData}, expected ${t.profileDir}`);
			// a write through the settings store must reach the fork folder's app-settings.yml
			const marker = 4242;
			await t.mainEval(`(() => { const s = __YTMD_TEST__.services.getProvider("settings"); s.set("e2e.marker", ${marker}); s.saveToDrive(); })()`);
			const file = path.join(t.profileDir, "app-settings.yml");
			await waitFor(() => (parse(fs.readFileSync(file, "utf8"))?.e2e?.marker === marker) || false, 5000, `e2e.marker=${marker} in ${file}`);
			const keys = ["ytm-credentials.key", "ytm-auth.key"].filter((k) => !fs.existsSync(path.join(t.profileDir, k)));
			if (keys.length) throw new Error(`missing in the fork folder: ${keys.join(", ")} (has ${fs.readdirSync(t.profileDir).join(", ")})`);
			const siblings = fs.readdirSync(appData).filter((n) => n !== FORK.userDataName);
			if (siblings.length) throw new Error(`the app created other folders in its appData: ${siblings.join(", ")}`);
			const changed = UPSTREAM_DIRS.filter((d, i) => snapshot(d) !== upstreamBefore[i]);
			if (changed.length) throw new Error(`the upstream app's folders changed during the run: ${changed.join(", ")}`);
			console.log(`  s15: userData ${paths.userData}, appData ${paths.appData}; settings, credential and auth stores in the fork folder; upstream folders untouched`);
		},
	},
];
