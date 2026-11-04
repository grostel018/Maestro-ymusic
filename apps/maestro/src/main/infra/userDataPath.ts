import path from "node:path";
import { FORK } from "@shared/fork";

/**
 * Profile folder for this build, or `null` when `--user-data-dir` is passed
 * (Chromium already applies it; e2e runs rely on that).
 */
export function resolveUserDataDir(o: { isProduction: boolean; argv: readonly string[]; appData: string }): string | null {
	if (o.argv.some((a) => a === "--user-data-dir" || a.startsWith("--user-data-dir="))) return null;
	return path.join(o.appData, o.isProduction ? FORK.userDataName : "ytmdesktop2-dev");
}

/** Electron's appData, or `YTMD_E2E_APPDATA` on the e2e bench (lets a run without `--user-data-dir` stay out of the real AppData). */
export function resolveAppDataDir(o: { env: Record<string, string | undefined>; appData: string }): string {
	return o.env.YTMD_E2E === "1" && o.env.YTMD_E2E_APPDATA ? o.env.YTMD_E2E_APPDATA : o.appData;
}

/** The files of `files` whose folder is not `dir`. */
export function findFilesOutside(files: readonly string[], dir: string, o: { ignoreCase?: boolean } = {}): string[] {
	const ignoreCase = o.ignoreCase ?? process.platform === "win32";
	const norm = (p: string) => (ignoreCase ? path.resolve(p).toLowerCase() : path.resolve(p));
	const want = norm(dir);
	return files.filter((f) => norm(path.dirname(f)) !== want);
}
