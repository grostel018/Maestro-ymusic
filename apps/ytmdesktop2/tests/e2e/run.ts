// End-to-end bench: the built app (electron-vite build) on an isolated profile, driven over CDP
// (--remote-debugging-port) and the main-process inspector (--inspect). See docs/TESTING.md.
// Usage: node tests/e2e/run.ts [s1 s2 ...] [--smoke] [--area <name>] [--perf] [--account] [--keep-going]
//        node tests/e2e/run.ts --login     (sign in once on the bench's signed-in profile)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DIR, createWorkDir, ELECTRON, gpuInfo, launchApp, type Scenario, type TestApp } from "./lib/app.ts";
import { perfFile } from "./lib/perf.ts";
import { launchOptionsOf, planGroups, selectScenarios } from "./lib/plan.ts";
import { SIGNED_IN_PROFILE, useSignedInProfile, writeSettings } from "./lib/profile.ts";
import { resetApp } from "./lib/session.ts";
import { scenarios as adblock } from "./scenarios/adblock.ts";
import { scenarios as background } from "./scenarios/background.ts";
import { scenarios as boot } from "./scenarios/boot.ts";
import { scenarios as glass } from "./scenarios/glass.ts";
import { scenarios as layout } from "./scenarios/layout.ts";
import { scenarios as perf } from "./scenarios/perf.ts";
import { scenarios as profile } from "./scenarios/profile.ts";
import { scenarios as settings } from "./scenarios/settings.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, "results");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const optionValues = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));

/** Each scenario file is one area; `--area <name>` runs only that file's scenarios. */
const withArea = (area: string, list: Scenario[]) => list.map((s) => ({ ...s, area: s.area ?? area }));
const FUNCTIONAL: Scenario[] = [
	...withArea("boot", boot),
	...withArea("profile", profile),
	...withArea("layout", layout),
	...withArea("glass", glass),
	...withArea("background", background),
	...withArea("settings", settings),
	...withArea("adblock", adblock),
];
const PERF = withArea("perf", perf);

fs.mkdirSync(RESULTS, { recursive: true });
// functional (sNN) and perf (pNN) runs keep separate logs so one does not erase the other; verify.ts reads both
const LOG = path.join(RESULTS, flag("perf") ? "last-perf.log" : "last-suite.log");
fs.writeFileSync(LOG, "");
function log(...parts: unknown[]) {
	const line = parts.map(String).join(" ");
	console.log(line);
	fs.appendFileSync(LOG, `${line}\n`);
}
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
// runner bugs and unhandled errors land in the log too, not only on the console
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
	process.on(event, (e: unknown) => {
		log(`ERROR ${event}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
		process.exit(1);
	});
}

if (flag("login")) {
	// The owner signs in by hand; the bench never types credentials.
	writeSettings(SIGNED_IN_PROFILE);
	log(`Sign in, then close the window. Profile: ${SIGNED_IN_PROFILE}`);
	const proc = spawn(ELECTRON, [APP_DIR, `--user-data-dir=${SIGNED_IN_PROFILE}`], { env: { ...process.env, YTMD_E2E: "1" }, stdio: "ignore" });
	await new Promise<void>((r) => proc.once("exit", () => r()));
	process.exit(0);
}

const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--area");
let selected: Scenario[];
try {
	selected = selectScenarios(flag("perf") ? PERF : FUNCTIONAL, {
		ids,
		smoke: flag("smoke"),
		areas: optionValues("area"),
		account: flag("account") || useSignedInProfile(),
	});
} catch (e) {
	log(`ERROR ${(e as Error).message}`);
	process.exit(2);
}
if (!selected.length) {
	log("ERROR no scenarios match the given filters");
	process.exit(2);
}

const keepGoing = flag("keep-going");
const workDir = createWorkDir();
log(`work folder: ${workDir}`);
const groups = planGroups(selected);
log(`${selected.length} scenario(s) in ${groups.length} launch(es)`);
const started = Date.now();
let passed = 0;
let failed = 0;
let skipped = 0;
let gpuLogged = false;

/** Screenshot + the tail of the app log for a failed scenario, in results/<id>/. */
async function saveFailure(s: Scenario, t: TestApp | null) {
	const dir = path.join(RESULTS, s.id);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	if (!t) return;
	try {
		await (await t.view("youtube")).screenshot(path.join(dir, "youtube.png"));
	} catch (err) {
		log(`  no screenshot: ${(err as Error).message}`);
	}
	try {
		const tail = fs.readFileSync(t.logFile, "utf8").split(/\r?\n/).slice(-200).join("\n");
		fs.writeFileSync(path.join(dir, "app-log-tail.txt"), tail);
	} catch {
		// no log yet
	}
	log(`  details: ${dir}`);
}

outer: for (const g of groups) {
	let t: TestApp | null = null;
	try {
		for (const [i, s] of g.scenarios.entries()) {
			if (s.account && !useSignedInProfile()) {
				skipped++;
				log(`SKIP ${s.id} ${s.title} (needs E2E_PROFILE=signed-in)`);
				continue;
			}
			const t0 = Date.now();
			try {
				if (!t) {
					t = await launchApp(launchOptionsOf(s));
					log(`  launched in ${secs(Date.now() - t0)}${g.scenarios.length > 1 ? ` (shared by ${g.scenarios.length})` : ""}`);
					if (!gpuLogged) {
						gpuLogged = true;
						log(`GPU: ${await gpuInfo().catch((e: Error) => `unknown (${e.message})`)}`);
					}
				} else if (i > 0) {
					try {
						await resetApp(t);
					} catch (e) {
						// e.g. the previous scenario quit the app: relaunch instead of failing this one
						log(`  reset failed (${(e as Error).message}), relaunching`);
						await t.close();
						t = await launchApp(launchOptionsOf(s));
					}
				}
				const t1 = Date.now();
				await s.run(t);
				passed++;
				log(`PASS ${s.id} ${s.title} (${secs(Date.now() - t1)})`);
			} catch (e) {
				failed++;
				log(`FAIL ${s.id} ${s.title}: ${(e as Error).message}`);
				await saveFailure(s, t);
				// the app's state is unknown after a failure: the rest of the group gets a fresh launch
				await t?.close();
				t = null;
				if (!keepGoing) break outer;
			}
		}
	} finally {
		await t?.close();
	}
}

const notRun = selected.length - passed - failed - skipped;
log(`${passed}/${passed + failed} passed${notRun ? `, ${notRun} not run (stopped at first failure; --keep-going runs all)` : ""} in ${secs(Date.now() - started)}`);
if (flag("perf")) log(`perf results: ${perfFile}`);
if (failed || process.env.E2E_KEEP === "1") log(`kept: ${workDir}`);
else fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
process.exit(failed ? 1 : 0);
