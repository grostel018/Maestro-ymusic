/** Top-level keys of YouTube player responses that carry ad schedules and ad renderers. */
export const AD_KEYS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"] as const;

/**
 * Removes ad payloads from a parsed YouTube response, in place, and returns how many keys it removed.
 * Looks at the root, its `playerResponse`, and the items of a top-level array (and their `playerResponse`),
 * and removes `enforcementMessageViewModel` anywhere within depth 4 of those.
 * Self-contained on purpose: its `.toString()` is injected into the page, so no imports or module scope.
 * Never throws; on hostile input it returns what it removed so far.
 */
export function pruneAds(data: unknown): number {
	const keys = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
	const maxDepth = 4;
	let removed = 0;
	const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
	const remove = (o: Record<string, unknown>, k: string) => {
		try {
			if (!Object.hasOwn(o, k)) return;
			delete o[k];
			if (!Object.hasOwn(o, k)) removed++;
		} catch {
			// frozen object or throwing accessor: leave it
		}
	};
	const clean = (target: unknown) => {
		if (!isObject(target)) return;
		for (const k of keys) remove(target, k);
		// enforcementMessageViewModel within maxDepth, iteratively so deep inputs cannot blow the stack
		const stack: Array<[Record<string, unknown>, number]> = [[target, 0]];
		while (stack.length) {
			const [o, depth] = stack.pop() as [Record<string, unknown>, number];
			remove(o, "enforcementMessageViewModel");
			if (depth >= maxDepth) continue;
			let names: string[] = [];
			try {
				names = Object.keys(o);
			} catch {
				continue;
			}
			for (const n of names) {
				let child: unknown;
				try {
					child = o[n];
				} catch {
					continue;
				}
				if (isObject(child)) stack.push([child, depth + 1]);
			}
		}
	};
	const withPlayerResponse = (v: unknown) => {
		if (!isObject(v)) return;
		clean(v);
		let pr: unknown;
		try {
			pr = v.playerResponse;
		} catch {
			return;
		}
		clean(pr);
	};
	try {
		if (Array.isArray(data)) for (const item of data) withPlayerResponse(item);
		else withPlayerResponse(data);
	} catch {
		// hostile input: keep what was removed
	}
	return removed;
}
