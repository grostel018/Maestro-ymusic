import fs from "node:fs";

export type CdpTarget = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl: string };

export type CdpSession = {
	call<T = any>(method: string, params?: Record<string, unknown>): Promise<T>;
	eval<T>(expr: string, opts?: { userGesture?: boolean }): Promise<T>;
	on(event: string, cb: (params: any) => void): void;
	screenshot(file: string): Promise<void>;
	close(): void;
};

/** Targets of a DevTools endpoint (`/json/list`), pages and Node alike. */
export async function listTargets(port: number): Promise<CdpTarget[]> {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	return (await res.json()) as CdpTarget[];
}

function describeException(details: any): string {
	return details?.exception?.description ?? details?.text ?? JSON.stringify(details).slice(0, 300);
}

/** Opens a CDP websocket (JSON-RPC) to one target. */
export function connect(wsUrl: string): Promise<CdpSession> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		let nextId = 0;
		const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; method: string }>();
		const listeners = new Map<string, Array<(params: any) => void>>();
		ws.onmessage = (e) => {
			const m = JSON.parse(String(e.data));
			if (m.id !== undefined) {
				const w = waiting.get(m.id);
				if (!w) return;
				waiting.delete(m.id);
				if (m.error) w.reject(new Error(`${w.method}: ${JSON.stringify(m.error)}`));
				else w.resolve(m.result);
			} else if (m.method) {
				for (const cb of listeners.get(m.method) ?? []) cb(m.params);
			}
		};
		ws.onclose = () => {
			for (const w of waiting.values()) w.reject(new Error(`${w.method}: websocket closed`));
			waiting.clear();
		};
		ws.onerror = () => reject(new Error(`websocket failed: ${wsUrl}`));
		ws.onopen = () => {
			const session: CdpSession = {
				call: (method, params = {}) =>
					new Promise((res, rej) => {
						const id = ++nextId;
						waiting.set(id, { resolve: res, reject: rej, method });
						ws.send(JSON.stringify({ id, method, params }));
					}),
				async eval<T>(expr: string, opts: { userGesture?: boolean } = {}) {
					const r = await session.call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: !!opts.userGesture });
					if (r.exceptionDetails) throw new Error(describeException(r.exceptionDetails));
					return r.result.value as T;
				},
				on(event, cb) {
					listeners.set(event, [...(listeners.get(event) ?? []), cb]);
				},
				async screenshot(file) {
					const r = await session.call<{ data: string }>("Page.captureScreenshot", { format: "png" });
					fs.writeFileSync(file, Buffer.from(r.data, "base64"));
				},
				close: () => ws.close(),
			};
			resolve(session);
		};
	});
}
