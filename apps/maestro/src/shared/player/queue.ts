// The offline player's queue (spec 2026-11-17 offline-player-parity): pure and immutable, so it can be saved,
// restored and tested. The online player keeps using YouTube Music's own queue.

export type Repeat = "off" | "all" | "one";

/** `order` is what plays; `base` is the unshuffled order, used when shuffle is turned off again. */
export type QueueState = { order: string[]; base: string[]; pos: number; repeat: Repeat; shuffle: boolean };

function shuffled(ids: string[], rnd: () => number): string[] {
	const out = [...ids];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** With shuffle, the start song plays first and the rest follow in random order. */
export function createQueue(ids: string[], startId?: string, shuffle = false, rnd: () => number = Math.random): QueueState {
	const base = [...ids];
	const start = startId && base.includes(startId) ? startId : undefined;
	if (!shuffle) return { order: base, base, pos: start ? base.indexOf(start) : 0, repeat: "off", shuffle: false };
	const first = start ?? base[0];
	const rest = shuffled(
		base.filter((id) => id !== first),
		rnd,
	);
	return { order: first === undefined ? [] : [first, ...rest], base, pos: 0, repeat: "off", shuffle: true };
}

/** `null` means the queue is over. Repeat-one replays only when a song ends; Next always moves on. */
export function next(q: QueueState, reason: "ended" | "skip"): QueueState | null {
	if (!q.order.length) return null;
	if (reason === "ended" && q.repeat === "one") return { ...q };
	if (q.pos < q.order.length - 1) return { ...q, pos: q.pos + 1 };
	return q.repeat === "all" ? { ...q, pos: 0 } : null;
}

export function prev(q: QueueState): QueueState {
	return { ...q, pos: Math.max(0, q.pos - 1) };
}

export function setRepeat(q: QueueState, repeat: Repeat): QueueState {
	return { ...q, repeat };
}

/** The current song stays current; turning shuffle off goes back to the original order. */
export function toggleShuffle(q: QueueState, rnd: () => number = Math.random): QueueState {
	const current = q.order[q.pos];
	if (q.shuffle) {
		const order = q.base.filter((id) => q.order.includes(id));
		for (const id of q.order) if (!order.includes(id)) order.push(id);
		return { ...q, order, pos: Math.max(0, order.indexOf(current)), shuffle: false };
	}
	const order = [...q.order.slice(0, q.pos + 1), ...shuffled(q.order.slice(q.pos + 1), rnd)];
	return { ...q, order, shuffle: true };
}

export function playNext(q: QueueState, ids: string[]): QueueState {
	const order = [...q.order.slice(0, q.pos + 1), ...ids, ...q.order.slice(q.pos + 1)];
	return { ...q, order, base: [...q.base, ...ids] };
}

export function addToQueue(q: QueueState, ids: string[]): QueueState {
	return { ...q, order: [...q.order, ...ids], base: [...q.base, ...ids] };
}

export function move(q: QueueState, from: number, to: number): QueueState {
	if (from === to || from < 0 || to < 0 || from >= q.order.length || to >= q.order.length) return q;
	const current = q.order[q.pos];
	const order = [...q.order];
	const [id] = order.splice(from, 1);
	order.splice(to, 0, id);
	return { ...q, order, pos: from === q.pos ? to : order.indexOf(current) };
}

/** Removing the current song makes the next one current (or the new last one). */
export function removeAt(q: QueueState, i: number): QueueState {
	if (i < 0 || i >= q.order.length) return q;
	const order = q.order.filter((_, k) => k !== i);
	const pos = i < q.pos ? q.pos - 1 : Math.min(q.pos, Math.max(0, order.length - 1));
	return { ...q, order, pos };
}

/** Drop songs whose file is gone; `null` when nothing is left. */
export function pruneMissing(q: QueueState, exists: (id: string) => boolean): QueueState | null {
	let out = q;
	for (let i = out.order.length - 1; i >= 0; i--) if (!exists(out.order[i])) out = removeAt(out, i);
	if (!out.order.length) return null;
	return { ...out, base: out.base.filter(exists) };
}

/** Songs to continue with when the queue ends: not played this session, same artist first, each group shuffled. */
export function pickAutoplay(lastId: string, all: { videoId: string; artist: string }[], played: Set<string>, rnd: () => number = Math.random): string[] {
	const artist = all.find((i) => i.videoId === lastId)?.artist.toLowerCase();
	const fresh = all.filter((i) => !played.has(i.videoId) && i.videoId !== lastId);
	const same = fresh.filter((i) => artist !== undefined && i.artist.toLowerCase() === artist).map((i) => i.videoId);
	const other = fresh.filter((i) => artist === undefined || i.artist.toLowerCase() !== artist).map((i) => i.videoId);
	return [...shuffled(same, rnd), ...shuffled(other, rnd)];
}
