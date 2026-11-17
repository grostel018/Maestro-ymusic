import { describe, expect, it } from "vitest";
import { readFrames } from "./ipc";

const frame = (op: number, data: unknown) => {
	const json = JSON.stringify(data);
	const buf = Buffer.alloc(8 + Buffer.byteLength(json));
	buf.writeInt32LE(op, 0);
	buf.writeInt32LE(Buffer.byteLength(json), 4);
	buf.write(json, 8);
	return buf;
};

describe("readFrames", () => {
	it("reads two frames that arrive in one chunk", () => {
		const { frames, rest } = readFrames(Buffer.concat([frame(1, { a: 1 }), frame(3, { b: 2 })]));
		expect(frames).toEqual([
			{ op: 1, json: { a: 1 } },
			{ op: 3, json: { b: 2 } },
		]);
		expect(rest.length).toBe(0);
	});
	it("keeps a frame split across chunks until it is complete", () => {
		const whole = frame(1, { cmd: "SET_ACTIVITY", data: "x".repeat(50) });
		const first = readFrames(whole.subarray(0, 20));
		expect(first.frames).toEqual([]);
		const second = readFrames(Buffer.concat([first.rest, whole.subarray(20)]));
		expect(second.frames).toHaveLength(1);
		expect(second.rest.length).toBe(0);
	});
	it("skips a frame with invalid JSON and goes on", () => {
		const bad = Buffer.alloc(8 + 3);
		bad.writeInt32LE(1, 0);
		bad.writeInt32LE(3, 4);
		bad.write("{x}", 8);
		expect(readFrames(Buffer.concat([bad, frame(1, { ok: true })])).frames).toEqual([{ op: 1, json: { ok: true } }]);
	});
});
