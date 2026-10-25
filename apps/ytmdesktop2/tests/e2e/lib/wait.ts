export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls `fn` until it returns something other than `false`; errors thrown by `fn` count as "not yet". */
export async function waitFor<T>(fn: () => Promise<T | false>, timeoutMs: number, what: string): Promise<T> {
	const end = Date.now() + timeoutMs;
	let last: unknown;
	while (Date.now() < end) {
		try {
			const value = await fn();
			if (value !== false) return value as T;
			last = value;
		} catch (e) {
			last = (e as Error).message;
		}
		await sleep(300);
	}
	throw new Error(`Timed out waiting for ${what}${last !== undefined ? ` (last: ${String(last).slice(0, 300)})` : ""}`);
}
