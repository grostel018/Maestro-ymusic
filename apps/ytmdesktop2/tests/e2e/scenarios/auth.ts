// Google sign-in window, against a local mock of Google's "this browser or app may not be secure" page
// (the real Google can't be automated: no credentials in tests, and its pages change).
import type { Scenario } from "../lib/app.ts";
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
];
