// Creates the signed-in bench profile (owner decision D6): copies the owner's YouTube/Google sign-in from
// their Firefox into an isolated folder the bench copies from (`E2E_PROFILE=signed-in`). Never touches the
// app's real profile. Run: `node tests/e2e/setup-signed-in.ts` (after a build).
import { launchApp } from "./lib/app.ts";
import { SIGNED_IN_PROFILE } from "./lib/profile.ts";
import { sleep } from "./lib/wait.ts";

const t = await launchApp({ profileDir: SIGNED_IN_PROFILE });
try {
	// The import asks for confirmation; the owner gave it once for the bench profile (D6).
	await t.mainEval(`(process.mainModule.require("electron").dialog.showMessageBox = async () => ({ response: 0 }), undefined)`);
	const result = await t.mainEval<{ status: string; imported: number }>("__YTMD_TEST__.googleLogin.importFromFirefox()");
	console.log(`import: ${result.status}, ${result.imported} cookies`);
	await sleep(8000);
	const yt = await t.view("youtube");
	const signedIn = await yt.eval<boolean>(`!!document.querySelector("ytmusic-settings-button img")`);
	console.log(signedIn ? "signed in" : "NOT signed in (check Firefox is signed in to YouTube)");
} finally {
	await t.close();
}
process.exit(0);
