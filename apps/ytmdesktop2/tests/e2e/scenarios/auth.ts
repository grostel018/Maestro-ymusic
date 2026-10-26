// Google sign-in window, against a local mock of Google's "this browser or app may not be secure" page
// (the real Google can't be automated: no credentials in tests, and its pages change), and the
// "Import sign-in from Firefox" path against a fake Firefox profile with fake cookies.
import fs from "node:fs";
import path from "node:path";
import { getWorkDir, type Scenario } from "../lib/app.ts";
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
