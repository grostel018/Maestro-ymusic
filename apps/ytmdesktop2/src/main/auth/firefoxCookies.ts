// "Import Google sign-in from Firefox" (owner decision D2): copies the user's own YouTube/Google cookies from
// a local Firefox profile into this app's session, after an explicit confirmation. Nothing leaves the machine.
// Approach as in yt-dlp's --cookies-from-browser (Unlicense): Firefox keeps cookies.sqlite locked while it
// runs, so the database (+ its WAL) is copied to a temp folder and read from there.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FirefoxProfile = { name: string; dir: string; isDefault: boolean };

/** Cookie domains imported: YouTube and Google sign-in, nothing else. */
const DOMAINS = [/(^|\.)youtube\.com$/i, /(^|\.)google\.com$/i];

/**
 * Parses Firefox's profiles.ini. The profile Firefox really uses is named in an `[Install…] Default=` entry;
 * the older `Default=1` flag can point at an unused profile, so the Install entry wins.
 */
export function parseProfilesIni(text: string, firefoxDir: string): FirefoxProfile[] {
	const sections: Array<{ name: string; keys: Record<string, string> }> = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		const header = /^\[(.+)\]$/.exec(line);
		if (header) sections.push({ name: header[1], keys: {} });
		else if (sections.length && line.includes("=")) {
			const i = line.indexOf("=");
			sections[sections.length - 1].keys[line.slice(0, i)] = line.slice(i + 1);
		}
	}
	const installDefault = sections.find((s) => s.name.startsWith("Install") && s.keys.Default)?.keys.Default;
	const toDir = (keys: Record<string, string>) => (keys.IsRelative === "0" ? keys.Path : path.join(firefoxDir, keys.Path));
	const profiles = sections
		.filter((s) => s.name.startsWith("Profile") && s.keys.Path)
		.map((s) => ({ name: s.keys.Name ?? s.keys.Path, dir: toDir(s.keys), rel: s.keys.Path.replace(/\\/g, "/"), flag: s.keys.Default === "1" }));
	const chosen = profiles.find((p) => installDefault && p.rel === installDefault.replace(/\\/g, "/")) ?? profiles.find((p) => p.flag) ?? profiles[0];
	return profiles.map((p) => ({ name: p.name, dir: p.dir, isDefault: p === chosen }));
}

/** Firefox's folder: %APPDATA%\Mozilla\Firefox (the bench may point it elsewhere under YTMD_E2E=1). */
export function firefoxDir(appData: string, env: NodeJS.ProcessEnv = process.env): string {
	if (env.YTMD_E2E === "1" && env.YTMD_E2E_FIREFOX_DIR) return env.YTMD_E2E_FIREFOX_DIR;
	return path.join(appData, "Mozilla", "Firefox");
}

export function listFirefoxProfiles(appData: string, env: NodeJS.ProcessEnv = process.env): FirefoxProfile[] {
	const dir = firefoxDir(appData, env);
	const ini = path.join(dir, "profiles.ini");
	if (!fs.existsSync(ini)) return [];
	return parseProfilesIni(fs.readFileSync(ini, "utf8"), dir).filter((p) => fs.existsSync(path.join(p.dir, "cookies.sqlite")));
}

export type FirefoxCookieRow = {
	name: string;
	value: string;
	host: string;
	path: string;
	expiry: number;
	isSecure: number;
	isHttpOnly: number;
	sameSite: number;
};

/** Shape accepted by Electron's `session.cookies.set`. */
export type ElectronCookie = {
	url: string;
	name: string;
	value: string;
	domain?: string;
	path: string;
	secure: boolean;
	httpOnly: boolean;
	expirationDate?: number;
	sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
};

export function isImportedDomain(host: string): boolean {
	const h = host.replace(/^\./, "");
	return DOMAINS.some((re) => re.test(h));
}

/** Firefox cookie row → Electron cookie. Returns null for cookies we don't import or can't express. */
export function toElectronCookie(row: FirefoxCookieRow, nowSec = Date.now() / 1000): ElectronCookie | null {
	if (!row.name || !isImportedDomain(row.host)) return null;
	// Firefox has stored `expiry` in seconds and, in newer versions, milliseconds.
	const expiry = row.expiry > 1e11 ? row.expiry / 1000 : row.expiry;
	if (expiry && expiry < nowSec) return null; // already expired
	const hostOnly = !row.host.startsWith(".");
	const secure = !!row.isSecure || row.name.startsWith("__Secure-") || row.name.startsWith("__Host-");
	const cookie: ElectronCookie = {
		url: `${secure ? "https" : "http"}://${row.host.replace(/^\./, "")}${row.path || "/"}`,
		name: row.name,
		value: row.value,
		path: row.path || "/",
		secure,
		httpOnly: !!row.isHttpOnly,
		expirationDate: expiry || undefined,
		// SameSite=None is only valid on Secure cookies; Chromium rejects it otherwise
		sameSite: row.sameSite === 1 ? "lax" : row.sameSite === 2 ? "strict" : row.sameSite === 0 && secure ? "no_restriction" : "unspecified",
	};
	// __Host- cookies and host-only cookies must not carry a Domain attribute
	if (!hostOnly && !row.name.startsWith("__Host-")) cookie.domain = row.host;
	return cookie;
}

type SqliteModule = { DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => { prepare(sql: string): { all(): unknown[] }; close(): void } };

/** Reads the YouTube/Google cookies of a Firefox profile from a temporary copy of its database. */
export function readFirefoxCookies(profileDir: string): ElectronCookie[] {
	const sqlite = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:sqlite") as SqliteModule | undefined;
	if (!sqlite) throw new Error("SQLite is not available in this build");
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-ffcookies-"));
	try {
		for (const suffix of ["", "-wal", "-shm"]) {
			const src = path.join(profileDir, `cookies.sqlite${suffix}`);
			if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, `cookies.sqlite${suffix}`));
		}
		const db = new sqlite.DatabaseSync(path.join(tmp, "cookies.sqlite"));
		try {
			const rows = db
				.prepare(
					"SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE host LIKE '%youtube.com' OR host LIKE '%google.com'",
				)
				.all() as FirefoxCookieRow[];
			return rows.map((r) => toElectronCookie(r)).filter((c): c is ElectronCookie => !!c);
		} finally {
			db.close();
		}
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}
