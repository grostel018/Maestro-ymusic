// Google sign-in window, against a local mock of Google's "this browser or app may not be secure" page
// (the real Google can't be automated: no credentials in tests, and its pages change), and the
// "Import sign-in from Firefox" path against a fake Firefox profile with fake cookies.
import fs from "node:fs";
import path from "node:path";
import { getWorkDir, launchApp, type Scenario } from "../lib/app.ts";
import { sleep, waitFor } from "../lib/wait.ts";
import { startMockServer } from "../mocks/server.ts";

type LoginState = { phase: string; identity: string; rejections: number };
const STATE = "__YTMD_TEST__.googleLogin.state()";
/** The sign-in window: the app window that is neither the main window nor hidden. */
const POPUP = `process.mainModule.require("electron").BrowserWindow.getAllWindows().find((w) => w !== __YTMD_TEST__.getMainWindow().main && w.isVisible())`;

export const scenarios: Scenario[] = [
	{
		id: "s17",
		smoke: true,
		title: "Google sign-in window: normal window, detects Google's rejection, retries with the other browser identity",
		run: async (t) => {
			const mock = await startMockServer();
			mock.on("GET", "/v3/signin/rejected", () => ({
				text: "<html><body><h1>Couldn't sign you in</h1><p>This browser or app may not be secure.</p></body></html>",
				headers: { "content-type": "text/html" },
			}));
			try {
				// not awaited: the promise resolves when the window closes
				await t.mainEval(`void __YTMD_TEST__.googleLogin.open(${JSON.stringify(`${mock.url}/v3/signin/rejected`)}) && undefined`);
				const first = await waitFor(
					async () => {
						const s = await t.mainEval<LoginState>(STATE);
						return s.phase === "rejected" ? s : false;
					},
					20000,
					"the rejection to be detected",
				);
				if (first.identity !== "firefox") throw new Error(`started as ${first.identity}, expected firefox on a fresh profile`);
				const win = await t.mainEval<{ modal: boolean; onTop: boolean; resizable: boolean }>(
					`(() => { const w = ${POPUP}; return { modal: w.isModal(), onTop: w.isAlwaysOnTop(), resizable: w.isResizable() }; })()`,
				);
				if (win.modal || win.onTop || !win.resizable) throw new Error(`sign-in window should be a normal window, got ${JSON.stringify(win)}`);

				await t.mainEval("__YTMD_TEST__.googleLogin.retry()");
				const second = await waitFor(
					async () => {
						const s = await t.mainEval<LoginState>(STATE);
						return s.identity === "chrome" && s.phase === "rejected" && s.rejections >= 2 ? s : false;
					},
					20000,
					"a retry as chrome (rejected again by the mock)",
				);
				const ua = await t.mainEval<string>(
					`process.mainModule.require("electron").webContents.getAllWebContents().find((w) => w.getURL().includes("/v3/signin/rejected"))?.getUserAgent() ?? ""`,
				);
				if (!/Chrome\//.test(ua) || /Firefox\//.test(ua)) throw new Error(`after retry the login view should present Chrome, UA was: ${ua}`);
				console.log(`    s17: ${JSON.stringify(first)} -> ${JSON.stringify(second)}`);

				await t.mainEval(`${POPUP}.close()`);
				await sleep(500);
				const closed = await t.mainEval<LoginState>(STATE);
				if (closed.phase !== "closed") throw new Error(`closing the window should reset the state, got ${closed.phase}`);
			} finally {
				await mock.close();
			}
		},
	},
	{
		id: "s18",
		smoke: true,
		title: "Import sign-in from Firefox copies only youtube.com/google.com cookies of the default profile into the app",
		launch: () => ({ env: { YTMD_E2E_FIREFOX_DIR: makeFakeFirefox() } }),
		run: async (t) => {
			// the confirmation dialog is answered by the test
			await t.mainEval(`(process.mainModule.require("electron").dialog.showMessageBox = async () => ({ response: 0 }), undefined)`);
			const result = await t.mainEval<{ status: string; imported: number; profile?: string }>("__YTMD_TEST__.googleLogin.importFromFirefox()");
			if (result.status !== "imported" || result.imported < 1 || result.profile !== "default-release") {
				throw new Error(`unexpected import result ${JSON.stringify(result)}`);
			}
			const cookies = await t.mainEval<Array<{ name: string; domain: string }>>(
				`process.mainModule.require("electron").session.defaultSession.cookies.get({}).then((all) => all.filter((c) => c.name.startsWith("YTMD_E2E_")).map((c) => ({ name: c.name, domain: c.domain })))`,
			);
			const names = cookies.map((c) => c.name).sort();
			if (names.join() !== "YTMD_E2E_GOOGLE,YTMD_E2E_YT") throw new Error(`imported test cookies: ${JSON.stringify(cookies)} (the example.com one must not be imported)`);
		},
	},
];

scenarios.push({
	id: "s19",
	smoke: true,
	title: "Last.fm connects through an in-app window in one go and stays connected after a restart",
	run: async (t) => {
		const mock = await startMockServer();
		let sessionChecks = 0;
		mock.on("GET", "/2.0/", (r) => {
			switch (r.query.get("method")) {
				case "auth.getToken":
					return { json: { token: "e2e-token" } };
				case "auth.getSession":
					// the user "approves" on the second poll
					return ++sessionChecks < 2 ? { status: 403, json: { error: 14, message: "Unauthorized Token" } } : { json: { session: { name: "e2e-user", key: "e2e-sk", subscriber: 0 } } };
				case "user.getInfo":
					return { json: { user: { name: "e2e-user" } } };
				default:
					return { json: {} };
			}
		});
		mock.on("GET", "/api/auth", () => ({ text: "<html><body>Allow access?</body></html>", headers: { "content-type": "text/html" } }));
		const env = { YTMD_E2E_API_LASTFM: `${mock.url}/2.0`, YTMD_E2E_API_LASTFMWEB: mock.url };
		// this scenario launches its own app (it needs the mock's address in the environment)
		await t.close();
		let app = await launchApp({ env, settings: { lastfm: { enabled: false } } });
		try {
			await app.mainEval("void __YTMD_TEST__.services.getProvider('lastfm').handleLastFMAuth() && undefined");
			const authPage = await waitFor(
				async () =>
					(await app.mainEval<string | null>(
						`process.mainModule.require("electron").webContents.getAllWebContents().map((w) => w.getURL()).find((u) => u.includes("/api/auth")) ?? null`,
					)) || false,
				15000,
				"the Last.fm approval page in an app window",
			);
			if (!authPage.startsWith(`${mock.url}/api/auth?`) || !authPage.includes("token=e2e-token") || authPage.includes("cb=")) {
				throw new Error(`unexpected approval page ${authPage} (must be in-app, with the token and no callback link)`);
			}
			await waitFor(
				async () => (await app.mainEval<{ connected: boolean; name: string | null }>("__YTMD_TEST__.services.getProvider('lastfm').getState()")).connected || false,
				20000,
				"Last.fm to be connected",
			);
			await waitFor(
				async () =>
					!(await app.mainEval<boolean>(`process.mainModule.require("electron").webContents.getAllWebContents().some((w) => w.getURL().includes("/api/auth"))`)),
				5000,
				"the approval window to close",
			);
			const tokens = mock.requests.filter((r) => r.query.get("method") === "auth.getToken").length;
			if (tokens !== 1) throw new Error(`auth.getToken called ${tokens} times (a sign-in loop)`);

			// restart on the same profile: still connected, no new sign-in
			await app.quit();
			app = await launchApp({ env, profileDir: app.profileDir });
			await waitFor(
				async () => (await app.mainEval<{ connected: boolean }>("__YTMD_TEST__.services.getProvider('lastfm').getState()")).connected || false,
				20000,
				"Last.fm to stay connected after a restart",
			);
			const tokensAfter = mock.requests.filter((r) => r.query.get("method") === "auth.getToken").length;
			if (tokensAfter !== 1) throw new Error(`restart asked Last.fm for a new sign-in (auth.getToken x${tokensAfter})`);
		} finally {
			await app.close();
			await mock.close();
		}
	},
});

/**
 * A fake Firefox folder: profiles.ini whose [Install…] entry names "default-release" (plus an unused
 * Default=1 profile, like real installs), and a cookies.sqlite with test cookies for youtube.com,
 * google.com and example.com.
 */
function makeFakeFirefox(): string {
	const dir = path.join(getWorkDir(), "fake-firefox");
	const profile = path.join(dir, "Profiles", "abcd.default-release");
	const unused = path.join(dir, "Profiles", "zzzz.default");
	fs.mkdirSync(profile, { recursive: true });
	fs.mkdirSync(unused, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "profiles.ini"),
		"[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abcd.default-release\n\n[Install1234]\nDefault=Profiles/abcd.default-release\nLocked=1\n\n[Profile1]\nName=default\nIsRelative=1\nPath=Profiles/zzzz.default\nDefault=1\n",
	);
	const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): any }).getBuiltinModule("node:sqlite");
	for (const p of [profile, unused]) {
		const db = new DatabaseSync(path.join(p, "cookies.sqlite"));
		db.exec("CREATE TABLE moz_cookies (name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER)");
		if (p === profile) {
			const insert = db.prepare("INSERT INTO moz_cookies VALUES (?, 'fake', ?, '/', ?, 1, 1, 0)");
			const future = Math.floor(Date.now() / 1000) + 86400;
			insert.run("YTMD_E2E_YT", ".youtube.com", future);
			insert.run("YTMD_E2E_GOOGLE", ".google.com", future);
			insert.run("YTMD_E2E_OTHER", ".example.com", future);
		}
		db.close();
	}
	return dir;
}
