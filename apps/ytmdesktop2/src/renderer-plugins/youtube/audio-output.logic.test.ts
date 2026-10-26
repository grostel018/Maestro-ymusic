import { describe, expect, it } from "vitest";
import { outputMenu, resolveSink } from "./audio-output.logic";

const out = (deviceId: string, label = deviceId) => ({ deviceId, kind: "audiooutput", label });
const devices = [out("default", "Default - Speakers"), out("communications", "Communications - Speakers"), out("usb", "USB DAC"), out("hdmi", ""), { deviceId: "mic", kind: "audioinput", label: "Mic" }, out("usb")];

describe("outputMenu", () => {
	it("lists the system default first and each output once", () => {
		expect(outputMenu(devices)).toEqual([
			{ deviceId: "default", label: "System default" },
			{ deviceId: "usb", label: "USB DAC" },
			{ deviceId: "hdmi", label: "Output device 1" },
		]);
		expect(outputMenu(undefined)).toEqual([{ deviceId: "default", label: "System default" }]);
	});
});

describe("resolveSink", () => {
	it("uses the chosen device while it is there", () => {
		expect(resolveSink("usb", devices)).toEqual({ sinkId: "usb", missing: false });
	});
	it("falls back to the default when the device is gone", () => {
		expect(resolveSink("bluetooth", devices)).toEqual({ sinkId: "", missing: true });
		expect(resolveSink("usb", [])).toEqual({ sinkId: "", missing: true });
	});
	it("treats the default and an empty setting as the system default", () => {
		expect(resolveSink("default", devices)).toEqual({ sinkId: "", missing: false });
		expect(resolveSink("", devices)).toEqual({ sinkId: "", missing: false });
		expect(resolveSink(undefined, null)).toEqual({ sinkId: "", missing: false });
	});
});
