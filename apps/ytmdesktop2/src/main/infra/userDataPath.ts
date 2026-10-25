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
