export type PowerHoldApi = { start(): number; stop(id: number): void };
export type PowerHold = { set(playing: boolean): void; isHeld(): boolean };

/** Keeps one power-save blocker while music plays and releases it when playback stops. */
export function createPowerHold(api: PowerHoldApi): PowerHold {
	let id: number | null = null;
	return {
		set(playing) {
			if (playing && id === null) id = api.start();
			else if (!playing && id !== null) {
				api.stop(id);
				id = null;
			}
		},
		isHeld: () => id !== null,
	};
}
