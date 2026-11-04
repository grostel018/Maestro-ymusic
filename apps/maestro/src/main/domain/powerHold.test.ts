import { describe, expect, it, vi } from "vitest";
import { createPowerHold } from "./powerHold";

describe("createPowerHold", () => {
	it("holds once while playing and releases on pause", () => {
		const api = { start: vi.fn(() => 7), stop: vi.fn() };
		const hold = createPowerHold(api);
		expect(hold.isHeld()).toBe(false);
		hold.set(true);
		hold.set(true);
		expect(api.start).toHaveBeenCalledTimes(1);
		expect(hold.isHeld()).toBe(true);
		hold.set(false);
		hold.set(false);
		expect(api.stop).toHaveBeenCalledTimes(1);
		expect(api.stop).toHaveBeenCalledWith(7);
		expect(hold.isHeld()).toBe(false);
	});

	it("takes a new hold when playback resumes", () => {
		let id = 0;
		const api = { start: vi.fn(() => ++id), stop: vi.fn() };
		const hold = createPowerHold(api);
		hold.set(true);
		hold.set(false);
		hold.set(true);
		expect(api.start).toHaveBeenCalledTimes(2);
		hold.set(false);
		expect(api.stop).toHaveBeenLastCalledWith(2);
	});
});
