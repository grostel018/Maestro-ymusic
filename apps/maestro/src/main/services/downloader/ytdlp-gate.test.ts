import { describe, expect, it } from "vitest";
import { YtDlpGate } from "./ytdlp-gate";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("YtDlpGate", () => {
	it("an update waits for running downloads, and new downloads wait for the update", async () => {
		const gate = new YtDlpGate();
		const log: string[] = [];
		const dl = deferred();
		const first = gate.use(async () => {
			log.push("dl1 start");
			await dl.promise;
			log.push("dl1 end");
		});
		const upd = deferred();
		const update = gate.update(async () => {
			log.push("update start");
			await upd.promise;
			log.push("update end");
		});
		await tick();
		expect(log).toEqual(["dl1 start"]);
		const second = gate.use(async () => void log.push("dl2"));
		dl.resolve();
		await tick();
		expect(log).toEqual(["dl1 start", "dl1 end", "update start"]);
		upd.resolve();
		await Promise.all([first, update, second]);
		expect(log).toEqual(["dl1 start", "dl1 end", "update start", "update end", "dl2"]);
	});

	it("a failing download or update still releases the gate", async () => {
		const gate = new YtDlpGate();
		await expect(gate.use(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
		await expect(gate.update(async () => Promise.reject(new Error("u")))).resolves.toBeUndefined();
		await expect(gate.use(async () => 7)).resolves.toBe(7);
	});
});
