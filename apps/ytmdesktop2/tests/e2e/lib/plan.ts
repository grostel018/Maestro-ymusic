// Turns the scenario list + command-line filters into launch groups: scenarios marked `reuse` with the
// same launch options share one app launch (reset between them); everything else gets its own launch.
import type { LaunchOptions, Scenario } from "./app.ts";

export type RunFilter = {
	/** explicit ids (case-insensitive); unknown ids are an error */
	ids?: string[];
	/** only scenarios tagged `smoke` */
	smoke?: boolean;
	/** only scenarios of these areas */
	areas?: string[];
	/** include `account` scenarios (otherwise they are left out) */
	account?: boolean;
};

export type LaunchGroup = {
	/** launch-options key shared by the group, or `own:<id>` for a scenario that launches alone */
	key: string;
	scenarios: Scenario[];
};

export function selectScenarios(all: Scenario[], filter: RunFilter): Scenario[] {
	const ids = (filter.ids ?? []).map((i) => i.toLowerCase());
	const known = new Set(all.map((s) => s.id.toLowerCase()));
	const unknown = ids.filter((i) => !known.has(i));
	if (unknown.length) throw new Error(`unknown scenario id(s): ${unknown.join(", ")}`);
	const areas = (filter.areas ?? []).map((a) => a.toLowerCase());
	return all.filter((s) => {
		if (ids.length) return ids.includes(s.id.toLowerCase());
		if (s.account && !filter.account) return false;
		if (filter.smoke && !s.smoke) return false;
		if (areas.length && !areas.includes((s.area ?? "").toLowerCase())) return false;
		return true;
	});
}

/** Stable key for static launch options; dynamic launches (functions) never share. */
function launchKey(launch: Scenario["launch"]): string | null {
	if (typeof launch === "function") return null;
	return JSON.stringify(sortKeys(launch ?? {}));
}

function sortKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sortKeys);
	if (v && typeof v === "object") {
		return Object.fromEntries(
			Object.keys(v as object)
				.sort()
				.map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
		);
	}
	return v;
}

/** Groups in first-appearance order; scenario order inside a group is kept. */
export function planGroups(selected: Scenario[]): LaunchGroup[] {
	const groups: LaunchGroup[] = [];
	const byKey = new Map<string, LaunchGroup>();
	for (const s of selected) {
		const key = s.reuse ? launchKey(s.launch) : null;
		if (key === null) {
			groups.push({ key: `own:${s.id}`, scenarios: [s] });
			continue;
		}
		let g = byKey.get(key);
		if (!g) {
			g = { key, scenarios: [] };
			byKey.set(key, g);
			groups.push(g);
		}
		g.scenarios.push(s);
	}
	return groups;
}

export function launchOptionsOf(s: Scenario): LaunchOptions | undefined {
	return typeof s.launch === "function" ? s.launch() : s.launch;
}
