import { describe, expect, it } from "vitest";
import player from "../shared/adblock/fixtures/player.json";
import { ADBLOCK_PRUNE_SOURCE } from "./adblock-prune";

/** Runs the IIFE against fake page globals so the real JSON / Response stay untouched. */
function boot() {
	const window: Record<string, any> = {};
	const json = { parse: JSON.parse };
	class Response {
		constructor(private body: string) {}
		json() {
			return Promise.resolve(JSON.parse(this.body));
		}
	}
	new Function("window", "JSON", "Response", ADBLOCK_PRUNE_SOURCE)(window, json, Response);
	return { window, json, Response };
}

describe("ADBLOCK_PRUNE_SOURCE", () => {
	const body = JSON.stringify(player);

	it("prunes JSON.parse results and counts removals", () => {
		const { window, json } = boot();
		const parsed = json.parse(body);
		expect(parsed).not.toHaveProperty("adPlacements");
		expect(parsed.streamingData).toEqual(player.streamingData);
		expect(window.__YTMD_ADBLOCK__.pruned).toBe(4);
	});

	it("leaves unrelated JSON alone and keeps JSON.parse errors", () => {
		const { window, json } = boot();
		expect(json.parse('{"a":1}')).toEqual({ a: 1 });
		expect(() => json.parse("{bad")).toThrow(SyntaxError);
		expect(window.__YTMD_ADBLOCK__.pruned).toBe(0);
	});

	it("prunes Response.prototype.json results", async () => {
		const { window, Response } = boot();
		const parsed = await new Response(body).json();
		expect(parsed).not.toHaveProperty("playerAds");
		expect(window.__YTMD_ADBLOCK__.pruned).toBe(4);
	});

	it("prunes ytInitialPlayerResponse and ytInitialData on set", () => {
		const { window } = boot();
		window.ytInitialPlayerResponse = structuredClone(player);
		window.ytInitialData = { playerResponse: structuredClone(player) };
		expect(window.ytInitialPlayerResponse).not.toHaveProperty("adPlacements");
		expect(window.ytInitialData.playerResponse).not.toHaveProperty("adSlots");
		expect(window.__YTMD_ADBLOCK__.pruned).toBe(8);
	});
});
