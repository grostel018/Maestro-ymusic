/**
 * Base URL for a third-party API. Under the e2e bench (`YTMD_E2E=1`) a test can point it at a local mock
 * server with `YTMD_E2E_API_<NAME>`; outside the bench the override is ignored, so it can never redirect
 * a normal user's traffic.
 */
export function apiBase(name: string, defaultUrl: string, env: Record<string, string | undefined> = process.env): string {
	if (env.YTMD_E2E !== "1") return defaultUrl;
	const override = env[`YTMD_E2E_API_${name.toUpperCase()}`];
	return override?.trim() ? override.trim().replace(/\/+$/, "") : defaultUrl;
}
