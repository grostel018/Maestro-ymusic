import { createFileRoute } from "@tanstack/react-router";
import AlertIcon from "@/assets/icons/alert-triangle.svg?react";
import { ControlBar } from "@/components/control-bar";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/youtube/login-notice")({
	component: LoginNoticePage,
});

type ImportResult = { status: "imported" | "cancelled" | "no-firefox" | "nothing-found" | "error"; imported: number; profile?: string; error?: string };
const IMPORT_MESSAGES: Record<ImportResult["status"], (r: ImportResult) => string> = {
	imported: (r) => `Imported from Firefox (${r.profile}). Loading YouTube Music…`,
	cancelled: () => "",
	"no-firefox": () => "No Firefox profile found on this computer.",
	"nothing-found": (r) => `Firefox (${r.profile}) isn't signed in to YouTube.`,
	error: (r) => `Couldn't read Firefox's sign-in: ${r.error}`,
};

/** Notice bar above the Google sign-in window: what's happening, and what to do if Google says no. */
function LoginNoticePage() {
	const state = trpc.googleLogin.state.useQuery(undefined, { refetchInterval: 1000 });
	const retry = trpc.googleLogin.retry.useMutation();
	const firefox = trpc.googleLogin.firefoxAvailable.useQuery();
	const importFirefox = trpc.googleLogin.importFromFirefox.useMutation();
	const importMessage = importFirefox.data && IMPORT_MESSAGES[importFirefox.data.status](importFirefox.data);
	const rejected = state.data?.phase === "rejected";
	const identity = state.data?.identity === "chrome" ? "Chrome" : "Firefox";
	const other = identity === "Chrome" ? "Firefox" : "Chrome";

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<ControlBar title="Google - Login" divider={<span>&nbsp;</span>} />
			<div className={`flex flex-auto flex-shrink-0 select-none items-center text-sm text-white ${rejected ? "bg-amber-600" : "bg-blue-500"}`}>
				<div className="container flex items-start justify-center gap-3">
					<AlertIcon className="mt-1 size-4 flex-shrink-0" />
					<div className="flex flex-col gap-1 leading-tight">
						{rejected ? (
							<>
								<p>
									<strong>Google didn't accept this window's browser identity ({identity}).</strong> This happens with apps built on Chromium.
								</p>
								<p>
									<button
										type="button"
										className="rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30 disabled:opacity-50"
										disabled={retry.isLoading}
										onClick={() => retry.mutate()}
									>
										Try again as {other}
									</button>
								</p>
							</>
						) : (
							<>
								<p>
									Sign in once: the app remembers it. This window is separate from your browser, so it can't reuse your Firefox or Chrome sign-in.
								</p>
								<p>If Google says this browser may not be secure, a button here lets you try another browser identity.</p>
							</>
						)}
						{firefox.data && (
							<p className="flex items-center gap-2">
								<button
									type="button"
									className="rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30 disabled:opacity-50"
									disabled={importFirefox.isLoading}
									onClick={() => importFirefox.mutate()}
								>
									Import sign-in from Firefox
								</button>
								{importMessage && <span>{importMessage}</span>}
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
