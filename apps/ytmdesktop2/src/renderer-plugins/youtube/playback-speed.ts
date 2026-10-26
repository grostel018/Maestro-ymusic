// Playback speed and keep-pitch (roadmap C4), shared by the video controls (C2) and the player-bar speed button.
// One rate for the session, applied to the <video> element directly so any rate works (the player API only takes
// its presets) and in Song mode too. "Keep pitch" maps to `preservesPitch`; a real pitch shift comes with D6.
import { clampSpeed, SPEEDS, speedLabel } from "./video-controls.logic";
import { type MenuItem, openMenu } from "./video-controls.menu";

const state = { rate: 1, keepPitch: true };
const listeners = new Set<() => void>();
let persistKeepPitch: ((value: boolean) => void) | null = null;

export const getSpeed = () => state.rate;
export const getKeepPitch = () => state.keepPitch;

export function onSpeedChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function emit(): void {
	for (const l of listeners) l();
}

function adShowing(): boolean {
	return !!document.querySelector("#movie_player")?.classList.contains("ad-showing");
}

/** Puts the rate and pitch setting on the page's video. Ads are left to the ad skipper, which sets its own rate. */
export function applySpeed(): void {
	if (adShowing()) return;
	for (const video of document.querySelectorAll("video")) {
		if (video.preservesPitch !== state.keepPitch) video.preservesPitch = state.keepPitch;
		if (Math.abs(video.playbackRate - state.rate) > 1e-3) video.playbackRate = state.rate;
	}
}

export function setSpeed(rate: number): void {
	state.rate = clampSpeed(rate);
	applySpeed();
	emit();
}

/** A rate the page set by itself (YouTube's own controls, if any) becomes ours. */
export function adoptSpeed(rate: number): void {
	if (adShowing() || Math.abs(rate - state.rate) < 1e-3) return;
	state.rate = clampSpeed(rate);
	emit();
}

export function setKeepPitch(value: boolean, persist = true): void {
	if (state.keepPitch === value) return;
	state.keepPitch = value;
	applySpeed();
	if (persist) persistKeepPitch?.(value);
	emit();
}

export function configureSpeed(opts: { persistKeepPitch: ((value: boolean) => void) | null }): void {
	persistKeepPitch = opts.persistKeepPitch;
}

/** Presets, a fine slider and the keep-pitch switch. */
export function openSpeedMenu(anchor: HTMLElement): void {
	const slider = document.createElement("input");
	slider.type = "range";
	slider.min = "0.25";
	slider.max = "3";
	slider.step = "0.05";
	slider.value = String(state.rate);
	slider.setAttribute("aria-label", "Custom speed");
	const value = document.createElement("output");
	value.textContent = speedLabel(state.rate);
	slider.addEventListener("input", () => {
		setSpeed(Number(slider.value));
		value.textContent = speedLabel(state.rate);
	});
	const custom = document.createElement("span");
	custom.style.display = "inline-flex";
	custom.style.gap = "8px";
	custom.append(slider, value);

	const pitch = document.createElement("input");
	pitch.type = "checkbox";
	pitch.checked = state.keepPitch;
	pitch.setAttribute("aria-label", "Keep pitch");
	pitch.addEventListener("change", () => setKeepPitch(pitch.checked));

	const items: MenuItem[] = [
		...SPEEDS.map((rate) => ({ label: speedLabel(rate), checked: Math.abs(rate - state.rate) < 1e-3, onSelect: () => setSpeed(rate) })),
		{ label: "Custom", element: custom },
		{ label: "Keep pitch", element: pitch },
	];
	openMenu(anchor, "Playback speed", items);
}
