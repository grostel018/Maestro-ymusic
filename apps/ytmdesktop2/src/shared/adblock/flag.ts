export const ADBLOCK_ARGV_FLAG = "--ytmd-adblock";

export function adblockArgvFor(o: { prune: boolean; fallback: boolean }): string {
	const parts = [o.prune ? "prune" : "", o.fallback ? "fallback" : ""].filter(Boolean);
	return `${ADBLOCK_ARGV_FLAG}=${parts.join(",")}`;
}

export function adblockFromArgv(argv: readonly string[]): { prune: boolean; fallback: boolean } {
	const prefix = `${ADBLOCK_ARGV_FLAG}=`;
	const arg = argv.find((a) => a.startsWith(prefix));
	const parts = arg ? arg.slice(prefix.length).split(",") : [];
	return { prune: parts.includes("prune"), fallback: parts.includes("fallback") };
}
