import EventEmitter from "node:events";
import { Socket } from "net";

export enum OPCode {
	HANDSHAKE = 0,
	FRAME = 1,
	CLOSE = 2,
	PING = 3,
	PONG = 4,
}

/** Largest frame we accept; Discord's are a few KB. A bigger length means a corrupt stream. */
const MAX_FRAME = 1 << 20;

/**
 * Complete frames (`op`, `length`, JSON) at the start of `buf`, and the unread rest. The socket can deliver part of
 * a frame, or several frames, in one chunk; the old reader took only the first and lost the others.
 */
export function readFrames(buf: Buffer): { frames: { op: number; json: unknown }[]; rest: Buffer } {
	const frames: { op: number; json: unknown }[] = [];
	let offset = 0;
	while (buf.length - offset >= 8) {
		const op = buf.readInt32LE(offset);
		const length = buf.readInt32LE(offset + 4);
		if (length < 0 || length > MAX_FRAME) return { frames, rest: Buffer.alloc(0) };
		if (buf.length - offset < 8 + length) break;
		try {
			frames.push({ op, json: JSON.parse(buf.toString("utf-8", offset + 8, offset + 8 + length)) });
		} catch {
			/* invalid json provided, skip this frame */
		}
		offset += 8 + length;
	}
	return { frames, rest: buf.subarray(offset) };
}

export default class IPCClient extends EventEmitter {
	private socket!: Socket;
	private pending: Buffer = Buffer.alloc(0);

	constructor() {
		super();
		this.createSocket();
	}

	private createSocket() {
		this.socket = new Socket();
		this.socket.on("connect", () => {
			this.emit("connect");
		});
		this.socket.on("close", (hadError: boolean) => {
			this.emit("close", hadError);
		});
		this.socket.on("error", (error) => {
			this.emit("error", error);
		});
		this.pending = Buffer.alloc(0);
		this.socket.on("data", (buffer: Buffer) => {
			const { frames, rest } = readFrames(this.pending.length ? Buffer.concat([this.pending, buffer]) : buffer);
			this.pending = Buffer.from(rest);
			for (const frame of frames) this.emit("data", frame);
		});
	}

	public connect(ipcPath: string) {
		if (this.socket.destroyed) {
			this.createSocket();
		}
		this.socket.connect(ipcPath);
	}

	public send(data: unknown, op = OPCode.FRAME) {
		if (this.socket.destroyed || !this.socket.writable) return;
		const json = JSON.stringify(data);
		const length = Buffer.byteLength(json);
		const buffer = Buffer.alloc(8 + length);
		buffer.writeInt32LE(op, 0);
		buffer.writeInt32LE(length, 4);
		buffer.write(json, 8, length);
		this.socket.write(buffer);
	}

	public close() {
		if (!this.socket.destroyed && !this.socket.closed) {
			try {
				this.send({}, OPCode.CLOSE);
			} catch {
				/* ignore */
			}
			this.socket.end();
		}
	}

	public destroy() {
		this.removeAllListeners();
		if (!this.socket.destroyed) {
			this.socket.removeAllListeners();
			this.socket.destroy();
		}
	}
}
