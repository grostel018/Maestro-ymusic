export type SuiteLog = {
	passed: Set<string>;
	failed: Set<string>;
	summary: { passed: number; total: number } | null;
};

/** Reads the `PASS id title` / `FAIL id title: err` / `p/t passed` lines run.ts tees to the suite log. */
export function parseSuiteLog(text: string): SuiteLog {
	const passed = new Set<string>();
	const failed = new Set<string>();
	let summary: SuiteLog["summary"] = null;
	for (const line of text.split(/\r?\n/)) {
		const row = /^(PASS|FAIL)\s+([sp]\d+[a-z]?)\b/.exec(line);
		if (row) {
			(row[1] === "PASS" ? passed : failed).add(row[2]);
			continue;
		}
		const sum = /^(\d+)\/(\d+) passed/.exec(line);
		if (sum) summary = { passed: Number(sum[1]), total: Number(sum[2]) };
	}
	return { passed, failed, summary };
}
