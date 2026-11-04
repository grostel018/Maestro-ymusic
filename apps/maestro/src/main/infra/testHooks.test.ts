import type { ServiceCollection } from "@main/core/providerCollection";
import { afterEach, describe, expect, it } from "vitest";
import { exposeTestHooks } from "./testHooks";

const serviceCollection = {} as ServiceCollection;
const getMainWindow = () => null;

describe("exposeTestHooks", () => {
	afterEach(() => {
		globalThis.__YTMD_TEST__ = undefined;
	});

	it("does nothing outside e2e runs", () => {
		exposeTestHooks({ serviceCollection, getMainWindow }, {});
		expect(globalThis.__YTMD_TEST__).toBeUndefined();
	});

	it("exposes services and the main window when YTMD_E2E=1", () => {
		exposeTestHooks({ serviceCollection, getMainWindow }, { YTMD_E2E: "1" });
		expect(globalThis.__YTMD_TEST__?.services).toBe(serviceCollection);
		expect(globalThis.__YTMD_TEST__?.getMainWindow).toBe(getMainWindow);
	});
});
