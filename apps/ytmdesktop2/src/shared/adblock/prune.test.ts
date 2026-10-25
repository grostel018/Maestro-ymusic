import { describe, expect, it } from "vitest";
import next from "./fixtures/next.json";
import player from "./fixtures/player.json";
import { AD_KEYS, pruneAds } from "./prune";

const clone = <T>(v: T): T => structuredClone(v);

describe("pruneAds", () => {
	it("removes every ad key from a player response and keeps the stream", () => {
		const data = clone(player) as Record<string, unknown>;
		expect(pruneAds(data)).toBe(4);
		for (const k of AD_KEYS) expect(data).not.toHaveProperty(k);
		expect(data.streamingData).toEqual(player.streamingData);
		expect(data.videoDetails).toEqual(player.videoDetails);
	});

	it("removes ad keys under a nested playerResponse and keeps contents", () => {
		const data = clone(next);
		expect(pruneAds(data)).toBeGreaterThanOrEqual(1);
		expect(data.playerResponse).not.toHaveProperty("adPlacements");
		expect(data.contents).toEqual(next.contents);
	});

	it("removes ad keys from items of a top-level array", () => {
		const data = [{ page: "watch" }, { playerResponse: clone(player) }];
		expect(pruneAds(data)).toBe(4);
		expect(data[1].playerResponse).not.toHaveProperty("adPlacements");
	});

	it("removes enforcementMessageViewModel under auxiliaryUi.messageRenderers", () => {
		const data = { auxiliaryUi: { messageRenderers: { enforcementMessageViewModel: { title: "Ad blockers are not allowed" } } }, contents: {} };
		expect(pruneAds(data)).toBe(1);
		expect(data.auxiliaryUi.messageRenderers).not.toHaveProperty("enforcementMessageViewModel");
	});

	it("is idempotent", () => {
		const data = clone(player);
		pruneAds(data);
		expect(pruneAds(data)).toBe(0);
	});

	it("prune tolerates hostile inputs", () => {
		for (const v of [null, 42, "x", [], Object.freeze({ adPlacements: [] }), undefined]) {
			expect(() => pruneAds(v)).not.toThrow();
			expect(pruneAds(v)).toBe(0);
		}
		let deep: Record<string, unknown> = {};
		const root = deep;
		for (let i = 0; i < 10000; i++) {
			const child = {};
			deep.child = child;
			deep = child;
		}
		deep.enforcementMessageViewModel = {};
		expect(() => pruneAds(root)).not.toThrow();
		const throwing = { get adPlacements() {
			throw new Error("boom");
		} };
		expect(() => pruneAds(throwing)).not.toThrow();
	});

	it("is self-contained: works when rebuilt from its source", () => {
		const rebuilt = new Function(`return ${pruneAds.toString()}`)() as typeof pruneAds;
		const data = clone(player);
		expect(rebuilt(data)).toBe(4);
		expect(data).not.toHaveProperty("adPlacements");
	});
});
