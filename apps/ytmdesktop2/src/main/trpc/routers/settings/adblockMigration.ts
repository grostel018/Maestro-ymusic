const DEFAULTS = { enabled: true, network: true, prune: true, fallback: true, hideUpsells: true } as const;

type Adblock = Partial<Record<keyof typeof DEFAULTS, unknown>> & { stats?: { total?: unknown } };

/** Fills any missing `adblock.*` setting with its default; never overwrites a value the user already has. */
export function migrateAdblockDefaults(store: { store: unknown; set(key: string, v: unknown): void }): void {
	const current = (store.store as { adblock?: Adblock } | undefined)?.adblock;
	if (!current || typeof current !== "object") {
		store.set("adblock", { ...DEFAULTS, stats: { total: 0 } });
		return;
	}
	for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
		if (typeof current[key] !== "boolean") store.set(`adblock.${key}`, DEFAULTS[key]);
	}
	if (typeof current.stats?.total !== "number") store.set("adblock.stats.total", 0);
}
