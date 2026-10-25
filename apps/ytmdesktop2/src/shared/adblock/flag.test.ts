import { describe, expect, it } from "vitest";
import { ADBLOCK_ARGV_FLAG, adblockArgvFor, adblockFromArgv } from "./flag";

describe("adblock argv flag", () => {
	it("round-trips", () => {
		expect(adblockFromArgv([adblockArgvFor({ prune: true })])).toEqual({ prune: true });
		expect(adblockFromArgv([adblockArgvFor({ prune: false })])).toEqual({ prune: false });
	});
	it("formats", () => {
		expect(adblockArgvFor({ prune: true })).toBe(`${ADBLOCK_ARGV_FLAG}=prune`);
		expect(adblockArgvFor({ prune: false })).toBe(`${ADBLOCK_ARGV_FLAG}=`);
	});
	it("still reads a flag that lists other parts", () => {
		expect(adblockFromArgv([`${ADBLOCK_ARGV_FLAG}=prune,fallback`])).toEqual({ prune: true });
	});
	it("defaults to false when absent", () => {
		expect(adblockFromArgv(["--type=renderer"])).toEqual({ prune: false });
	});
});
