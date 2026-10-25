// End-to-end bench: the built app (electron-vite build) on an isolated profile, driven over CDP
// (--remote-debugging-port) and the main-process inspector (--inspect).
// Usage: pnpm test:e2e [s1 s2 ...]    signed-in profile: node tests/e2e/run.ts --login, then E2E_PROFILE=signed-in
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DIR, createWorkDir, ELECTRON, gpuInfo, launchApp, type Scenario, type TestApp } from "./lib/app.ts";
import { perfFile } from "./lib/perf.ts";
import { SIGNED_IN_PROFILE, useSignedInProfile, writeSettings } from "./lib/profile.ts";
import { scenarios as boot } from "./scenarios/boot.ts";
import { scenarios as perf } from "./scenarios/perf.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, "results");
const args = process.argv.slice(2);
// --perf runs the pNN baseline scenarios instead of the sNN functional ones
const scenarios: Scenario[] = args.includes("--perf") ? perf : boot;
const only = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());

fs.mkdirSync(RESULTS, { recursive: true });
const LOG = path.join(RESULTS, "last-suite.log");
fs.writeFileSync(LOG, "");
function log(...parts: unknown[]) {
	const line = parts.map(String).join(" ");
	console.log(line);
	fs.appendFileSync(LOG, `${line}\n`);
}

if (args.includes("--login")) {
	// The owner signs in to a throwaway Google account by hand; the bench never types credentials.
	writeSettings(SIGNED_IN_PROFILE);
	log(`Sign in, then close the window. Profile: ${SIGNED_IN_PROFILE}`);
	const proc = spawn(ELECTRON, [APP_DIR, `--user-data-dir=${SIGNED_IN_PROFILE}`], { env: { ...process.env, YTMD_E2E: "1" }, stdio: "ignore" });
	await new Promise<void>((r) => proc.once("exit", () => r()));
	process.exit(0);
}

const workDir = createWorkDir();
log(`work folder: ${workDir}`);
const selected = scenarios.filter((s) => !only.length || only.includes(s.id.toLowerCase()));
let passed = 0;
let failed = 0;
let gpuLogged = false;

for (const s of selected) {
	if (s.account && !useSignedInProfile()) {
		log(`SKIP ${s.id} ${s.title} (needs E2E_PROFILE=signed-in)`);
		continue;
	}
	let t: TestApp | null = null;
	try {
		t = await launchApp(s.launch);
		if (!gpuLogged) {
			gpuLogged = true;
			log(`GPU: ${await gpuInfo().catch((e: Error) => `unknown (${e.message})`)}`);
		}
		await s.run(t);
		passed++;
		log(`PASS ${s.id} ${s.title}`);
	} catch (e) {
		failed++;
		log(`FAIL ${s.id} ${s.title}: ${(e as Error).message}`);
		if (t) {
			const shot = path.join(workDir, `${s.id}-failure.png`);
			try {
				const yt = await t.view("youtube");
				await yt.screenshot(shot);
				log(`  screenshot: ${shot}`);
			} catch (err) {
				log(`  no screenshot: ${(err as Error).message}`);
			}
		}
	} finally {
		await t?.close();
	}
}

log(`${passed}/${passed + failed} passed`);
if (args.includes("--perf")) log(`perf results: ${perfFile}`);
if (failed || process.env.E2E_KEEP === "1") log(`kept: ${workDir}`);
else fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
process.exit(failed ? 1 : 0);
