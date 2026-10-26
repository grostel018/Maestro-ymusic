import type { ServiceCollection } from "@main/core/providerCollection";

/** What the e2e bench reaches through the main-process inspector (`globalThis.__YTMD_TEST__`). */
export type TestHooks = {
	services: ServiceCollection;
	getMainWindow: () => unknown;
	/** Google sign-in window: open on any URL (a mock page in tests), read its state, retry. */
	googleLogin?: { open(url: string): Promise<boolean>; state(): unknown; retry(): boolean };
};

declare global {
	// eslint-disable-next-line no-var
	var __YTMD_TEST__: TestHooks | undefined;
}

/** Exposes main-process internals to the e2e bench; a no-op unless `YTMD_E2E=1`. */
export function exposeTestHooks(
	o: { serviceCollection: ServiceCollection; getMainWindow: () => unknown; googleLogin?: TestHooks["googleLogin"] },
	env: NodeJS.ProcessEnv = process.env,
) {
	if (env.YTMD_E2E !== "1") return;
	globalThis.__YTMD_TEST__ = { services: o.serviceCollection, getMainWindow: o.getMainWindow, googleLogin: o.googleLogin };
}
