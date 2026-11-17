import { createQueue } from "@shared/player/queue";
import { describe, expect, it } from "vitest";
import { restoreQueue } from "./restore";

const q = createQueue(["a", "b", "c"], "b");

describe("restoreQueue", () => {
	it("missing item is dropped on restore", () => {
		const r = restoreQueue({ q, positionSec: 42 }, (id) => id !== "a");
		expect(r?.q.order).toEqual(["b", "c"]);
		expect(r?.q.order[r.q.pos]).toBe("b");
	});

	it("restores position when the current item exists", () => {
		expect(restoreQueue({ q, positionSec: 42 }, () => true)?.positionSec).toBe(42);
		const gone = restoreQueue({ q, positionSec: 42 }, (id) => id !== "b");
		expect(gone?.q.order[gone.q.pos]).toBe("c");
		expect(gone?.positionSec).toBe(0);
	});

	it("null when nothing is left or nothing was saved", () => {
		expect(restoreQueue({ q, positionSec: 1 }, () => false)).toBeNull();
		expect(restoreQueue(null, () => true)).toBeNull();
	});

	it("ignores a malformed save", () => {
		expect(restoreQueue({ q: { order: "x" }, positionSec: 1 } as never, () => true)).toBeNull();
	});
});
