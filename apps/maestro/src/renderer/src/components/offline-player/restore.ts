import { pruneMissing, type QueueState } from "@shared/player/queue";

export type SavedQueue = { q: QueueState; positionSec: number };

function isQueue(v: unknown): v is QueueState {
	const q = v as QueueState;
	return !!q && Array.isArray(q.order) && Array.isArray(q.base) && Number.isInteger(q.pos) && q.order.every((id) => typeof id === "string");
}

/** The saved queue, without songs whose file is gone. The position only carries over when the same song is current. */
export function restoreQueue(saved: SavedQueue | null, exists: (id: string) => boolean): SavedQueue | null {
	if (!saved || !isQueue(saved.q)) return null;
	const q = pruneMissing({ ...saved.q, pos: Math.min(Math.max(0, saved.q.pos), Math.max(0, saved.q.order.length - 1)) }, exists);
	if (!q) return null;
	const same = q.order[q.pos] === saved.q.order[saved.q.pos];
	return { q, positionSec: same && Number.isFinite(saved.positionSec) ? Math.max(0, saved.positionSec) : 0 };
}
