// Regenerates /VERIFICATION.md from the last suite logs (functional + perf). Usage: pnpm verify
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS } from "./checks.ts";
import { parseSuiteLog } from "./lib/suite-log.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const LOGS = ["last-suite.log", "last-perf.log"].map((f) => path.join(HERE, "results", f));

const passed = new Set<string>();
const failed = new Set<string>();
let sumPassed = 0;
let sumTotal = 0;
let anySummary = false;
for (const file of LOGS) {
	if (!fs.existsSync(file)) continue;
	const log = parseSuiteLog(fs.readFileSync(file, "utf8"));
	for (const id of log.passed) passed.add(id);
	for (const id of log.failed) failed.add(id);
	if (log.summary) {
		anySummary = true;
		sumPassed += log.summary.passed;
		sumTotal += log.summary.total;
	}
}

function verdict(evidence: string[]): { ok: boolean; note: string } {
	const bad = evidence.filter((id) => failed.has(id) || !passed.has(id));
	if (!bad.length) return { ok: true, note: "" };
	return { ok: false, note: bad.map((id) => (failed.has(id) ? `${id} failed` : `${id} not run`)).join(", ") };
}

const cell = (s: string) => s.replace(/\|/g, "/");
let ok = 0;
const rows = CHECKS.map((c, i) => {
	const v = verdict(c.evidence);
	if (v.ok) ok++;
	return `| ${i + 1} | ${c.area} | ${cell(c.check)} | ${c.evidence.join(", ")} | ${v.ok ? "[x]" : "[ ] FAIL"} | ${cell(v.note)} |`;
});

const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lines = [
	"# YTMDesktop2 Plus - Verification Checklist",
	"",
	`Checked on ${date}. **${ok}/${CHECKS.length} verified.**`,
	"",
	"Every row is tied to evidence: an end-to-end scenario (`sNN`) or a perf scenario (`pNN`), run by `tests/e2e/run.ts` against the real built app. " +
		"A row is ticked only when all of its evidence passed in the last run. Perf rows other than p7 mean \"measured and recorded\"; their numbers are in `tests/e2e/results/perf-*.json`, and a tick means \"measured\", not \"within budget\": budgets are judged in section 8 of the design spec. " +
		"Regenerate with `pnpm verify` after each batch.",
	"",
	`Suite: ${anySummary ? `${sumPassed}/${sumTotal} passed` : "no summary found"}`,
	"",
	"| # | Area | Check | Evidence | Result | Notes |",
	"|---|---|---|---|---|---|",
	...rows,
	"",
];
fs.writeFileSync(path.join(REPO_ROOT, "VERIFICATION.md"), lines.join("\n"));
console.log(`${ok}/${CHECKS.length} verified`);
