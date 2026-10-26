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
import { resetApp, settingsFingerprint } from "./lib/session.ts";
import { scenarios as adblock } from "./scenarios/adblock.ts";
import { scenarios as auth } from "./scenarios/auth.ts";
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
	...withArea("auth", auth),
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
/** The app the runner currently has open, so a runner crash can still close it (it owns the debug ports). */
let current: TestApp | null = null;
// runner bugs and unhandled errors land in the log too, not only on the console
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
	process.on(event, (e: unknown) => {
		log(`ERROR ${event}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
		const app = current;
		current = null;
		void Promise.race([app?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 6000))]).finally(() => process.exit(1));
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

// bare words: `s12` / `p4` are scenario ids, anything else is an area (so `pnpm t:smoke layout` works)
const words = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--area");
const ids = words.filter((w) => /^[sp]\d+[a-z]?$/i.test(w));
let selected: Scenario[];
try {
	selected = selectScenarios(flag("perf") ? PERF : FUNCTIONAL, {
		ids,
		smoke: flag("smoke"),
		areas: [...optionValues("area"), ...words.filter((w) => !ids.includes(w))],
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

/** The newest electron-N.log in the work folder (covers launches that failed before a TestApp existed). */
function newestAppLog(): string | null {
	const logs = fs
		.readdirSync(workDir)
		.filter((n) => /^electron-\d+\.log$/.test(n))
		.map((n) => path.join(workDir, n));
	return logs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}

/** Screenshot + the tail of the app log for a failed scenario, in results/<id>/. */
async function saveFailure(s: Scenario, t: TestApp | null) {
	const dir = path.join(RESULTS, s.id);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	if (t) {
		try {
			const yt = await t.view("youtube");
			await yt.screenshot(path.join(dir, "youtube.png"));
		} catch (err) {
			log(`  no screenshot: ${(err as Error).message}`);
		}
	}
	const logFile = t?.logFile ?? newestAppLog();
	try {
		if (logFile) fs.writeFileSync(path.join(dir, "app-log-tail.txt"), fs.readFileSync(logFile, "utf8").split(/\r?\n/).slice(-200).join("\n"));
	} catch {
		// no log yet
	}
	log(`  details: ${dir}`);
}

async function launch(s: Scenario): Promise<TestApp> {
	const app = await launchApp({ ...launchOptionsOf(s), audible: flag("perf") });
	current = app;
	return app;
}

async function closeApp(t: TestApp | null) {
	if (current === t) current = null;
	await t?.close();
}

outer: for (const g of groups) {
	let t: TestApp | null = null;
	/** settings right after this group's launch; a reuse scenario that changes them triggers a relaunch */
	let baseline: string | null = null;
	try {
		for (const [i, s] of g.scenarios.entries()) {
			if (s.account && !useSignedInProfile()) {
				skipped++;
				log(`SKIP ${s.id} ${s.title} (needs E2E_PROFILE=signed-in)`);
				continue;
			}
			const t0 = Date.now();
			try {
				if (t && i > 0) {
					try {
						const changed = baseline !== null && (await settingsFingerprint(t)) !== baseline;
						if (changed) throw new Error("the previous scenario changed settings");
						await resetApp(t);
					} catch (e) {
						// e.g. the previous scenario quit the app or changed settings: relaunch instead of leaking state
						log(`  reset: ${(e as Error).message}, relaunching`);
						await closeApp(t);
						t = null;
					}
				}
				if (!t) {
					t = await launch(s);
					baseline = g.scenarios.length > 1 ? await settingsFingerprint(t) : null;
					log(`  launched in ${secs(Date.now() - t0)}${g.scenarios.length > 1 ? ` (shared by ${g.scenarios.length})` : ""}`);
					if (!gpuLogged) {
						gpuLogged = true;
						log(`GPU: ${await gpuInfo().catch((e: Error) => `unknown (${e.message})`)}`);
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
				await closeApp(t);
				t = null;
				if (!keepGoing) break outer;
			}
		}
	} finally {
		await closeApp(t);
	}
}

const notRun = selected.length - passed - failed - skipped;
log(`${passed}/${passed + failed} passed${notRun ? `, ${notRun} not run (stopped at first failure; --keep-going runs all)` : ""} in ${secs(Date.now() - started)}`);
if (flag("perf")) log(`perf results: ${perfFile}`);
if (failed || process.env.E2E_KEEP === "1") log(`kept: ${workDir}`);
else fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
process.exit(failed ? 1 : 0);
