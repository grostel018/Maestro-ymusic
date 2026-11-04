import { describe, expect, it } from "vitest";
import { chromiumSwitches } from "./chromiumSwitches";

const names = (r: ReturnType<typeof chromiumSwitches>) => r.switches.map(([name]) => name);

describe("chromiumSwitches", () => {
	const win = chromiumSwitches({ platform: "win32", forceGpu: false, isDevelopment: false });

	it("keeps GPU rasterization on Windows", () => {
		expect(win.switches).toContainEqual(["enable-gpu-rasterization"]);
	});

	it("does not force the GPU or set the misspelled in-progress-gpu switch", () => {
		expect(names(win)).not.toContain("ignore-gpu-blocklist");
		expect(names(win)).not.toContain("in-progress-gpu");
	});

	// Step 3b measured no CPU gain from dropping these (p6 0.26 % without vs 0.25 % with), so they stay.
	it("keeps the backgrounding and occlusion switches", () => {
		for (const name of ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]) {
			expect(win.switches).toContainEqual([name]);
		}
	});

	it("disables occlusion, wake-up throttling, EcoQoS and Chromium's media session", () => {
		expect(win.disableFeatures).toEqual(["CalculateNativeWinOcclusion", "IntensiveWakeUpThrottling", "UseEcoQoSForBackgroundProcess", "MediaSessionService"]);
	});

	it("ignores the GPU blocklist when forceGpu is set", () => {
		expect(chromiumSwitches({ platform: "win32", forceGpu: true, isDevelopment: false }).switches).toContainEqual(["ignore-gpu-blocklist"]);
	});

	it("disables web security only in development", () => {
		expect(names(win)).not.toContain("disable-web-security");
		expect(names(chromiumSwitches({ platform: "win32", forceGpu: false, isDevelopment: true }))).toContain("disable-web-security");
	});

	it("adds the Linux GTK and Ozone switches", () => {
		const linux = chromiumSwitches({ platform: "linux", forceGpu: false, isDevelopment: false, gtkVersion: "4" });
		expect(linux.switches).toContainEqual(["gtk-version", "4"]);
		expect(linux.switches).toContainEqual(["ozone-platform-hint", "auto"]);
		expect(linux.enableFeatures).toContain("UseOzonePlatform");
		expect(names(linux)).not.toContain("enable-gpu-rasterization");
	});
});
