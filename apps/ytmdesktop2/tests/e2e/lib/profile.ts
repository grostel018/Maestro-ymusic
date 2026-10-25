import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

/** Persistent profile the owner signs in to by hand (`node tests/e2e/run.ts --login`). */
export const SIGNED_IN_PROFILE = path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Local"), "ytmd-e2e", "signed-in");

/** Chromium folders that are large, rebuilt on demand, or locked; never copied. */
const SKIP_COPY = new Set(["Cache", "Code Cache", "GPUCache", "logs"]);

const BASE_SETTINGS = {
	app: {
		autostart: false,
		autoupdate: false,
		enableStatisticsAndErrorTracing: false,
		getstarted: false,
	},
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge(target: Obj, source: Obj): Obj {
	const out: Obj = { ...target };
	for (const [k, v] of Object.entries(source)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k] as Obj, v) : v;
	return out;
}

const MIGRATIONS_FILE = path.join(import.meta.dirname, "..", "..", "..", "src", "main", "trpc", "routers", "settings", "migrations.ts");

/**
 * electron-conf runs the migrations whose index is above `__internal__.migrationVersion`, so a seeded file without
 * one replays them all over the seeded values. The count comes from migrations.ts (one `hook(` per entry).
 */
export function currentMigrationVersion(): number {
	const count = (fs.readFileSync(MIGRATIONS_FILE, "utf8").match(/^		hook\(/gm) ?? []).length;
	if (!count) throw new Error(`no migration hooks found in ${MIGRATIONS_FILE}`);
	return count - 1;
}

export const useSignedInProfile = () => process.env.E2E_PROFILE === "signed-in" && fs.existsSync(SIGNED_IN_PROFILE);

/** Writes `<profile>/app-settings.yml` with the bench defaults plus `settings`, over whatever is already there. */
export function writeSettings(profileDir: string, settings: Obj = {}) {
	fs.mkdirSync(profileDir, { recursive: true });
	const file = path.join(profileDir, "app-settings.yml");
	const existing = fs.existsSync(file) ? (parse(fs.readFileSync(file, "utf8")) as Obj | null) : null;
	const merged = deepMerge(deepMerge(existing ?? {}, BASE_SETTINGS), settings);
	// a profile that already has a version keeps it; a fresh seed starts at the store's current one
	const internal = isObj(merged.__internal__) ? merged.__internal__ : {};
	if (typeof internal.migrationVersion !== "number") merged.__internal__ = { ...internal, migrationVersion: currentMigrationVersion() };
	fs.writeFileSync(file, stringify(merged));
}

/** Prepares a fresh profile: a copy of the signed-in profile when `E2E_PROFILE=signed-in`, then the seeded settings. */
export function seedProfile(profileDir: string, settings: Obj = {}) {
	fs.mkdirSync(profileDir, { recursive: true });
	if (useSignedInProfile()) {
		fs.cpSync(SIGNED_IN_PROFILE, profileDir, {
			recursive: true,
			filter: (src) => !SKIP_COPY.has(path.basename(src)),
		});
	}
	writeSettings(profileDir, settings);
}
