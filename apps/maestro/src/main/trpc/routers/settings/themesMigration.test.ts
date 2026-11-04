import { describe, expect, it } from "vitest";
import { migrateThemesBackground } from "./themesMigration";

function fakeStore(initial: unknown) {
	const sets: Record<string, unknown> = {};
	const deleted: string[] = [];
	return { sets, deleted, store: { store: initial, set: (k: string, v: unknown) => void (sets[k] = v), delete: (k: string) => void deleted.push(k) } };
}

describe("migrateThemesBackground", () => {
	it("maps a turned-off thumbnail background to plain and drops the old toggles", () => {
		const { sets, deleted, store } = fakeStore({ themes: { thumbnailBackground: false, blur: true, glass: true } });
		migrateThemesBackground(store);
		expect(sets).toEqual({ "themes.background": "plain" });
		expect(deleted.sort()).toEqual(["themes.blur", "themes.glass", "themes.thumbnailBackground"]);
	});
	it("defaults to artwork", () => {
		const { sets, store } = fakeStore({ themes: { enabled: true } });
		migrateThemesBackground(store);
		expect(sets).toEqual({ "themes.background": "artwork" });
	});
	it("keeps an existing choice", () => {
		const { sets, deleted, store } = fakeStore({ themes: { background: "plain" } });
		migrateThemesBackground(store);
		expect(sets).toEqual({});
		expect(deleted).toEqual([]);
	});
});
