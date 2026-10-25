export const ADBLOCK_ARGV_FLAG = "--ytmd-adblock";

/** Preload argv flag: whether the prune layer runs. (The fallback skipper follows its setting live, not this flag.) */
export function adblockArgvFor(o: { prune: boolean }): string {
	return `${ADBLOCK_ARGV_FLAG}=${o.prune ? "prune" : ""}`;
}

export function adblockFromArgv(argv: readonly string[]): { prune: boolean } {
	const prefix = `${ADBLOCK_ARGV_FLAG}=`;
	const arg = argv.find((a) => a.startsWith(prefix));
	const parts = arg ? arg.slice(prefix.length).split(",") : [];
	return { prune: parts.includes("prune") };
}
