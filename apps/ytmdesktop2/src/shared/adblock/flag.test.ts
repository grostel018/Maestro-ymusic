import { describe, expect, it } from "vitest";
import { ADBLOCK_ARGV_FLAG, adblockArgvFor, adblockFromArgv } from "./flag";

describe("adblock argv flag", () => {
	it("round-trips", () => {
		expect(adblockFromArgv([adblockArgvFor({ prune: true, fallback: false })])).toEqual({ prune: true, fallback: false });
		expect(adblockFromArgv([adblockArgvFor({ prune: true, fallback: true })])).toEqual({ prune: true, fallback: true });
	});
	it("formats", () => {
		expect(adblockArgvFor({ prune: true, fallback: true })).toBe(`${ADBLOCK_ARGV_FLAG}=prune,fallback`);
		expect(adblockArgvFor({ prune: false, fallback: false })).toBe(`${ADBLOCK_ARGV_FLAG}=`);
	});
	it("defaults both false when absent", () => {
		expect(adblockFromArgv(["--type=renderer"])).toEqual({ prune: false, fallback: false });
	});
});
