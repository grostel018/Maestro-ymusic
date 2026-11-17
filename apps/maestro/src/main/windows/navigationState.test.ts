import { describe, expect, it } from "vitest";
import { navigationState } from "./navigationState";

const fakeHistory = (back: boolean, forward: boolean, index: number) => ({
	canGoBack: () => back,
	canGoForward: () => forward,
	getActiveIndex: () => index,
});

describe("navigationState", () => {
	it("reports both directions and the index", () => {
		expect(navigationState(fakeHistory(true, true, 2))).toEqual({ canGoBack: true, canGoForward: true, index: 2 });
	});

	it("reports when Forward is not possible", () => {
		expect(navigationState(fakeHistory(true, false, 3)).canGoForward).toBe(false);
	});
});
