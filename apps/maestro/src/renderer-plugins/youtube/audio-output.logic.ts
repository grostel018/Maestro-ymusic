// Audio output device (roadmap C3). Pure decisions; the page side lives in audio-output.renderer.ts.
// Approach after pear-desktop@7c55260:src/plugins/custom-output-device (MIT): `setSinkId` on the media element.

export const DEFAULT_DEVICE = "default";

export type OutputDevice = { deviceId: string; label: string };

type DeviceLike = { deviceId: string; kind: string; label: string };

/** Output devices for the menu: the system default first, then each device once (Windows' "communications" alias dropped). */
export function outputMenu(devices: readonly DeviceLike[] | null | undefined): OutputDevice[] {
	const out: OutputDevice[] = [{ deviceId: DEFAULT_DEVICE, label: "System default" }];
	const seen = new Set([DEFAULT_DEVICE, "communications", ""]);
	let unnamed = 0;
	for (const d of devices ?? []) {
		if (d.kind !== "audiooutput" || seen.has(d.deviceId)) continue;
		seen.add(d.deviceId);
		out.push({ deviceId: d.deviceId, label: d.label || `Output device ${++unnamed}` });
	}
	return out;
}

/**
 * The sink to use for the wanted device: "" (the system default) for the default or for a device that is gone.
 * `missing` asks the caller to tell the user once.
 */
export function resolveSink(wanted: string | null | undefined, devices: readonly DeviceLike[] | null | undefined): { sinkId: string; missing: boolean } {
	if (!wanted || wanted === DEFAULT_DEVICE) return { sinkId: "", missing: false };
	const present = (devices ?? []).some((d) => d.kind === "audiooutput" && d.deviceId === wanted);
	return present ? { sinkId: wanted, missing: false } : { sinkId: "", missing: true };
}
