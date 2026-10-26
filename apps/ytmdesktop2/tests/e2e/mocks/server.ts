// Tiny local HTTP server for faking third-party APIs (Last.fm, Wikipedia, MusicBrainz, Genius…) in bench
// scenarios, so they are deterministic and need no keys. Point the app at it with
// launchApp({ env: { YTMD_E2E_API_<NAME>: mock.url } }); the app reads it through src/shared/e2e/apiBase.ts.
import http from "node:http";
import type { AddressInfo } from "node:net";

export type MockRequest = { method: string; path: string; query: URLSearchParams; body: string };
export type MockReply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };
export type MockHandler = (req: MockRequest) => MockReply | Promise<MockReply>;

export type MockServer = {
	url: string;
	/** every request received, in order (for assertions) */
	requests: MockRequest[];
	/** handler for `METHOD /path` (path without query); later registrations win */
	on(method: string, path: string, handler: MockHandler): void;
	close(): Promise<void>;
};

export async function startMockServer(): Promise<MockServer> {
	const routes = new Map<string, MockHandler>();
	const requests: MockRequest[] = [];
	const server = http.createServer((req, res) => {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", async () => {
			const u = new URL(req.url ?? "/", "http://127.0.0.1");
			const r: MockRequest = { method: req.method ?? "GET", path: u.pathname, query: u.searchParams, body };
			requests.push(r);
			const handler = routes.get(`${r.method} ${r.path}`);
			const reply: MockReply = handler ? await handler(r) : { status: 404, json: { error: `no mock for ${r.method} ${r.path}` } };
			const isJson = reply.json !== undefined;
			res.writeHead(reply.status ?? 200, { "content-type": isJson ? "application/json" : "text/plain", ...reply.headers });
			res.end(isJson ? JSON.stringify(reply.json) : (reply.text ?? ""));
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		on: (method, path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler),
		close: () => new Promise<void>((r) => server.close(() => r())),
	};
}
