import { describe, expect, it } from "vitest";
import { addToQueue, createQueue, move, next, pickAutoplay, playNext, prev, pruneMissing, removeAt, setRepeat, toggleShuffle } from "./queue";

/** Deterministic random numbers for shuffles. */
function seeded(seed = 1) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}
const ids = ["a", "b", "c", "d"];
const cur = (q: { order: string[]; pos: number }) => q.order[q.pos];

describe("queue", () => {
	it("starts at the given id", () => {
		expect(cur(createQueue(ids, "c"))).toBe("c");
		expect(createQueue(ids).pos).toBe(0);
	});

	it("repeat off ends", () => {
		expect(next(createQueue(ids, "d"), "ended")).toBeNull();
		expect(next(createQueue(ids, "d"), "skip")).toBeNull();
	});

	it("repeat all wraps", () => {
		const q = next(setRepeat(createQueue(ids, "d"), "all"), "ended");
		expect(q?.pos).toBe(0);
	});

	it("repeat one replays on ended", () => {
		const q = next(setRepeat(createQueue(ids, "b"), "one"), "ended");
		expect(cur(q!)).toBe("b");
	});

	it("next ignores repeat one", () => {
		const q = next(setRepeat(createQueue(ids, "b"), "one"), "skip");
		expect(cur(q!)).toBe("c");
	});

	it("prev at start stays at 0", () => {
		expect(prev(createQueue(ids)).pos).toBe(0);
		expect(cur(prev(createQueue(ids, "c")))).toBe("b");
	});

	it("toggle shuffle keeps current", () => {
		const q = createQueue(ids, "b");
		const s = toggleShuffle(q, seeded(7));
		expect(s.shuffle).toBe(true);
		expect(cur(s)).toBe("b");
		expect([...s.order].sort()).toEqual([...ids].sort());
		const back = toggleShuffle(s);
		expect(back.shuffle).toBe(false);
		expect(back.order).toEqual(ids);
		expect(cur(back)).toBe("b");
	});

	it("createQueue with shuffle starts at the given id", () => {
		const q = createQueue(ids, "c", true, seeded(3));
		expect(cur(q)).toBe("c");
		expect(q.pos).toBe(0);
		expect(q.base).toEqual(ids);
	});

	it("playNext inserts after pos", () => {
		const q = playNext(createQueue(ids, "b"), ["x", "y"]);
		expect(q.order).toEqual(["a", "b", "x", "y", "c", "d"]);
		expect(cur(q)).toBe("b");
	});

	it("addToQueue appends", () => {
		expect(addToQueue(createQueue(ids, "b"), ["x"]).order).toEqual([...ids, "x"]);
	});

	it("move and removeAt keep the current id current", () => {
		const q = createQueue(ids, "c");
		const moved = move(q, 2, 0);
		expect(moved.order).toEqual(["c", "a", "b", "d"]);
		expect(cur(moved)).toBe("c");
		const moved2 = move(q, 0, 3);
		expect(moved2.order).toEqual(["b", "c", "d", "a"]);
		expect(cur(moved2)).toBe("c");
		const removed = removeAt(q, 0);
		expect(removed.order).toEqual(["b", "c", "d"]);
		expect(cur(removed)).toBe("c");
	});

	it("removing the current song makes the next one current", () => {
		const q = removeAt(createQueue(ids, "b"), 1);
		expect(cur(q)).toBe("c");
	});

	it("pruneMissing drops ids and keeps current when it exists", () => {
		const q = pruneMissing(createQueue(ids, "c"), (id) => id !== "a");
		expect(q?.order).toEqual(["b", "c", "d"]);
		expect(cur(q!)).toBe("c");
		const gone = pruneMissing(createQueue(ids, "c"), (id) => id !== "c");
		expect(gone?.order).toEqual(["a", "b", "d"]);
		expect(cur(gone!)).toBe("d");
		expect(pruneMissing(createQueue(ids), () => false)).toBeNull();
	});

	it("pickAutoplay never returns played ids and puts the same artist first", () => {
		const all = [
			{ videoId: "a", artist: "X" },
			{ videoId: "b", artist: "Y" },
			{ videoId: "c", artist: "X" },
			{ videoId: "d", artist: "Y" },
			{ videoId: "e", artist: "x" },
		];
		const picked = pickAutoplay("a", all, new Set(["a", "d"]), seeded(5));
		expect([...picked].sort()).toEqual(["b", "c", "e"]);
		expect(picked.slice(0, 2).sort()).toEqual(["c", "e"]);
		expect(pickAutoplay("a", all, new Set(all.map((i) => i.videoId)))).toEqual([]);
	});
});
