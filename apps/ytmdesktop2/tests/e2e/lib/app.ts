import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CdpSession, connect, listTargets } from "./cdp.ts";
import { seedProfile, writeSettings } from "./profile.ts";
import { sleep, waitFor } from "./wait.ts";

export const PORTS = { cdp: 9361, inspect: 9362 };
/** A stable public track; change it here if it ever becomes unavailable. */
export const TRACK_URL = "https://music.youtube.com/watch?v=dQw4w9WgXcQ";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** The `electron` package exports the path of its binary (node_modules/electron/dist/electron.exe). */
export const ELECTRON = createRequire(import.meta.url)("electron") as string;
const WORK_PREFIX = "ytmd-e2e-";

export type TestApp = {
	/** Evaluates in the main process via the inspector; `globalThis.__YTMD_TEST__` is available. */
	mainEval<T>(expr: string): Promise<T>;
	view(match: "youtube" | "toolbar" | RegExp): Promise<CdpSession>;
	profileDir: string;
	workDir: string;
	/** The Electron process's stdout/stderr log for this launch. */
	logFile: string;
	/** Quits through `app.quit()` (window close handlers run, state is saved) and waits for the process to exit. */
	quit(): Promise<void>;
	close(): Promise<void>;
};

export type Scenario = {
	/** `sNN` or `pNN` */
	id: string;
	title: string;
	/** Needs the signed-in bench profile (`E2E_PROFILE=signed-in`); skipped otherwise. */
	account?: boolean;
	/** Feature area (set by run.ts from the scenario file), used by `--area`. */
	area?: string;
	/** Part of the fast `--smoke` set (one or two per area). */
	smoke?: boolean;
	/**
	 * Safe to run in an app already used by earlier scenarios with the same static `launch` (the runner
	 * resets window and playback between them). Leave off for scenarios that test startup, relaunch,
	 * or change settings at runtime.
	 */
	reuse?: boolean;
	/** Options for the app launched for this scenario; a function is called when the scenario starts. */
	launch?: LaunchOptions | (() => LaunchOptions);
	run: (t: TestApp) => Promise<void>;
};

export type LaunchOptions = {
	extraArgs?: string[];
	settings?: Record<string, unknown>;
	/** Reuse this profile folder (e.g. a relaunch) instead of a new `profile-N`; the settings are merged into it. */
	profileDir?: string;
	/** `false` launches without `--user-data-dir` (the app picks its own folder); isolate it with `env.YTMD_E2E_APPDATA`. */
	userDataFlag?: boolean;
	env?: Record<string, string>;
};

let workDir: string | null = null;
let launches = 0;

/** Removes stale `ytmd-e2e-*` folders of earlier runs, then creates this run's folder. */
export function createWorkDir(): string {
	for (const old of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(WORK_PREFIX))) {
		try {
			fs.rmSync(path.join(os.tmpdir(), old), { recursive: true, force: true, maxRetries: 3 });
		} catch {
			// in use by another run
		}
	}
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), WORK_PREFIX));
	return workDir;
}

export const getWorkDir = () => workDir ?? createWorkDir();

/** Kills a process and every child it started (never by image name: other Electron apps may be running). */
export function killTree(pid: number | undefined) {
	if (!pid) return;
	try {
		execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
	} catch {
		// already gone
	}
}

const VIEW_MATCHERS: Record<"youtube" | "toolbar", RegExp> = {
	youtube: /^https:\/\/music\.youtube\.com\//,
	toolbar: /\/youtube\/toolbar/,
};

/** Some regions redirect signed-out first loads to consent.youtube.com; this answers it with "Reject all". */
async function rejectConsent(): Promise<boolean> {
	const target = (await listTargets(PORTS.cdp)).find((x) => x.type === "page" && x.url.startsWith("https://consent.youtube.com/"));
	if (!target) return false;
	const s = await connect(target.webSocketDebuggerUrl);
	try {
		return await s.eval<boolean>(
			`(() => {
				const buttons = [...document.querySelectorAll("button, [role=button], input[type=submit]")];
				const reject = buttons.find((b) => /reject all/i.test(b.getAttribute("aria-label") || b.textContent || b.value || ""));
				if (!reject) return false;
				reject.click();
				return true;
			})()`,
			{ userGesture: true },
		);
	} finally {
		s.close();
	}
}

export async function launchApp(opts: LaunchOptions = {}): Promise<TestApp> {
	const work = getWorkDir();
	const n = ++launches;
	const profileDir = opts.profileDir ?? path.join(work, `profile-${n}`);
	if (opts.profileDir && fs.existsSync(profileDir)) writeSettings(profileDir, opts.settings);
	else seedProfile(profileDir, opts.settings);
	const logFile = path.join(work, `electron-${n}.log`);
	const logFd = fs.openSync(logFile, "w");
	const userDataArgs = opts.userDataFlag === false ? [] : [`--user-data-dir=${profileDir}`];
	const proc: ChildProcess = spawn(
		ELECTRON,
		[APP_DIR, ...userDataArgs, `--remote-debugging-port=${PORTS.cdp}`, `--inspect=${PORTS.inspect}`, ...(opts.extraArgs ?? [])],
		{ env: { ...process.env, ...opts.env, YTMD_E2E: "1" }, stdio: ["ignore", logFd, logFd] },
	);
	fs.closeSync(logFd);
	let exited = false;
	const exitPromise = new Promise<void>((r) => proc.once("exit", () => r()));
	proc.once("exit", () => {
		exited = true;
	});

	const sessions: CdpSession[] = [];
	let main: CdpSession | null = null;
	const getMain = async () => {
		if (main) return main;
		const target = await waitFor(async () => (await listTargets(PORTS.inspect))[0] ?? false, 30000, "the main-process inspector");
		main = await connect(target.webSocketDebuggerUrl);
		await main.call("Runtime.enable");
		return main;
	};

	const app: TestApp = {
		profileDir,
		workDir: work,
		logFile,
		async mainEval<T>(expr: string) {
			if (exited) throw new Error("the app has exited");
			const s = await getMain();
			const r = await s.call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
			if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
			return r.result.value as T;
		},
		async view(match) {
			const re = typeof match === "string" ? VIEW_MATCHERS[match] : match;
			const target = await waitFor(
				async () => (await listTargets(PORTS.cdp)).find((x) => x.type === "page" && re.test(x.url)) ?? false,
				30000,
				`a view matching ${re}`,
			);
			const s = await connect(target.webSocketDebuggerUrl);
			sessions.push(s);
			return s;
		},
		async quit() {
			if (!exited) {
				// deferred: quitting inside Runtime.evaluate stalls; then detach so the inspector does not hold the exit
				await app.mainEval("setTimeout(() => process.mainModule.require('electron').app.quit(), 100) && undefined");
				main?.close();
				main = null;
				await Promise.race([exitPromise, sleep(15000)]);
				if (!exited) throw new Error("the app did not exit within 15 s of app.quit()");
			}
			await app.close();
		},
		async close() {
			for (const s of sessions.splice(0)) s.close();
			main?.close();
			main = null;
			killTree(proc.pid);
			await Promise.race([exitPromise, sleep(5000)]);
			await sleep(500); // let the debugging ports close
		},
	};

	try {
		if (exited) throw new Error("electron exited at once");
		await getMain();
		// Wait for YouTube Music, answering a consent redirect on the way.
		const state = await waitFor(
			async () => {
				if (exited) return "exited";
				const targets = await listTargets(PORTS.cdp);
				if (targets.some((x) => x.type === "page" && VIEW_MATCHERS.youtube.test(x.url))) return "ready";
				await rejectConsent();
				return false;
			},
			90000,
			"music.youtube.com to load",
		);
		if (state === "exited") throw new Error("electron exited during start");
	} catch (e) {
		await app.close();
		throw e;
	}
	return app;
}

/** GPU device names of the running app (browser-level `SystemInfo.getInfo`). */
export async function gpuInfo(): Promise<string> {
	const version = (await (await fetch(`http://127.0.0.1:${PORTS.cdp}/json/version`)).json()) as { webSocketDebuggerUrl: string };
	const s = await connect(version.webSocketDebuggerUrl);
	try {
		const info = await s.call<{ gpu: { devices: Array<{ deviceString: string; vendorString: string }> } }>("SystemInfo.getInfo");
		return info.gpu.devices.map((d) => d.deviceString || d.vendorString).join(", ") || "(none)";
	} finally {
		s.close();
	}
}
