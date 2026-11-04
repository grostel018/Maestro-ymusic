export type FrameSummary = { p50: number; p95: number; max: number; droppedPct: number };

/** A frame slower than this misses a 60 Hz deadline by a visible margin. */
export const DROPPED_FRAME_MS = 25;

/** Percentile by sorted index `floor(p * n / 100)` (clamped), so the top 5 % of samples sit above p95. */
function percentile(sorted: number[], p: number): number {
	return sorted[Math.min(sorted.length - 1, Math.floor((p * sorted.length) / 100))];
}

export function summarizeFrames(deltasMs: number[]): FrameSummary {
	if (!deltasMs.length) return { p50: 0, p95: 0, max: 0, droppedPct: 0 };
	const sorted = [...deltasMs].sort((a, b) => a - b);
	const dropped = deltasMs.filter((d) => d > DROPPED_FRAME_MS).length;
	return {
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		max: sorted[sorted.length - 1],
		droppedPct: (dropped / deltasMs.length) * 100,
	};
}
