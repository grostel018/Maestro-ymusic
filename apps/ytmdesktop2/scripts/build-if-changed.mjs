// Builds the app (electron-vite build) only when its inputs changed since the last build.
// Inputs: src/** (minus generated files), build config, package.json, .env.local (keys are baked in).
// The hash of the last successful build is kept in out/.build-hash. `--force` always builds.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HASH_FILE = path.join(APP, "out", ".build-hash");
const INPUTS = ["src", "electron.vite.config.ts", "package.json", ".env.local", "tsconfig.json", "tsconfig.node.json", "tsconfig.web.json"];
// written by the build itself, so they must not count as inputs
const GENERATED = [/\.generated\.[^/\\]+$/, /routeTree\.gen\.ts$/, /[/\\]preload[/\\]generated[/\\]/];

function walk(p, out) {
	const st = fs.statSync(p, { throwIfNoEntry: false });
	if (!st) return;
	if (st.isDirectory()) {
		for (const name of fs.readdirSync(p).sort()) walk(path.join(p, name), out);
	} else if (!GENERATED.some((re) => re.test(p))) {
		out.push(p);
	}
}

export function inputHash() {
	const files = [];
	for (const i of INPUTS) walk(path.join(APP, i), files);
	const h = createHash("sha256");
	for (const f of files) {
		h.update(path.relative(APP, f));
		h.update("\0");
		h.update(fs.readFileSync(f));
		h.update("\0");
	}
	return h.digest("hex");
}

const force = process.argv.includes("--force");
const before = inputHash();
const built = fs.existsSync(path.join(APP, "out", "main", "index.js"));
const previous = fs.existsSync(HASH_FILE) ? fs.readFileSync(HASH_FILE, "utf8").trim() : "";

if (!force && built && previous === before) {
	console.log("build: cached (inputs unchanged)");
	process.exit(0);
}
console.log(`build: ${force ? "forced" : built ? "inputs changed" : "no build yet"}, running electron-vite build`);
const t0 = Date.now();
const r = spawnSync("npx", ["electron-vite", "build"], { cwd: APP, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) {
	console.error("build: FAILED");
	process.exit(r.status ?? 1);
}
fs.writeFileSync(HASH_FILE, inputHash());
console.log(`build: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
