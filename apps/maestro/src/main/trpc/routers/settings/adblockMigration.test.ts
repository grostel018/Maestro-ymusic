import { describe, expect, it } from "vitest";
import { migrateAdblockDefaults } from "./adblockMigration";

function fakeStore(initial: unknown) {
	const sets: Record<string, unknown> = {};
	return { sets, store: { store: initial, set: (k: string, v: unknown) => void (sets[k] = v) } };
}

describe("migrateAdblockDefaults", () => {
	it("keeps user choices", () => {
		const { sets, store } = fakeStore({ adblock: { enabled: false } });
		migrateAdblockDefaults(store);
		expect(sets).toEqual({ "adblock.network": true, "adblock.prune": true, "adblock.fallback": true, "adblock.hideUpsells": true, "adblock.stats.total": 0 });
		expect("adblock.enabled" in sets).toBe(false);
	});
	it("gives an empty store the full defaults", () => {
		const { sets, store } = fakeStore({});
		migrateAdblockDefaults(store);
		expect(sets).toEqual({ adblock: { enabled: true, network: true, prune: true, fallback: true, hideUpsells: true, stats: { total: 0 } } });
	});
});
