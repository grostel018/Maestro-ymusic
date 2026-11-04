import { describe, expect, it } from "vitest";
import type { Scenario } from "./app.ts";
import { planGroups, selectScenarios } from "./plan.ts";

const run = async () => {};
const sc = (id: string, extra: Partial<Scenario> = {}): Scenario => ({ id, title: id, run, ...extra });

describe("selectScenarios", () => {
	const all = [sc("s1", { smoke: true, area: "boot" }), sc("s2", { area: "layout" }), sc("s3", { account: true, area: "auth" })];

	it("rejects unknown ids instead of passing nothing", () => {
		expect(() => selectScenarios(all, { ids: ["s99"] })).toThrow("unknown scenario id(s): s99");
	});
	it("explicit ids win over filters, case-insensitive", () => {
		expect(selectScenarios(all, { ids: ["S2"], smoke: true }).map((s) => s.id)).toEqual(["s2"]);
	});
	it("smoke and area filters, account left out by default", () => {
		expect(selectScenarios(all, { smoke: true }).map((s) => s.id)).toEqual(["s1"]);
		expect(selectScenarios(all, { areas: ["LAYOUT"] }).map((s) => s.id)).toEqual(["s2"]);
		expect(selectScenarios(all, {}).map((s) => s.id)).toEqual(["s1", "s2"]);
		expect(selectScenarios(all, { account: true }).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
	});
});

describe("planGroups", () => {
	it("reuse scenarios with equal launch options share one launch, in first-appearance order", () => {
		const groups = planGroups([
			sc("a", { reuse: true }),
			sc("b", { reuse: true, launch: { settings: { x: { b: 1, a: 2 } } } }),
			sc("c", { reuse: true, launch: {} }),
			sc("d", { reuse: true, launch: { settings: { x: { a: 2, b: 1 } } } }),
		]);
		expect(groups.map((g) => g.scenarios.map((s) => s.id))).toEqual([["a", "c"], ["b", "d"]]);
	});
	it("non-reuse and dynamic launches always get their own launch", () => {
		const groups = planGroups([sc("a", { reuse: true }), sc("b"), sc("c", { reuse: true, launch: () => ({}) }), sc("d", { reuse: true })]);
		expect(groups.map((g) => g.scenarios.map((s) => s.id))).toEqual([["a", "d"], ["b"], ["c"]]);
	});
});
