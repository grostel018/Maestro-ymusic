import { afterEach, describe, expect, it } from "vitest";
import { type MockServer, startMockServer } from "./server.ts";

let mock: MockServer | null = null;
afterEach(async () => {
	await mock?.close();
	mock = null;
});

describe("startMockServer", () => {
	it("serves registered routes, records requests, 404s the rest", async () => {
		mock = await startMockServer();
		mock.on("get", "/2.0/", (r) => ({ json: { method: r.query.get("method") } }));
		const ok = await fetch(`${mock.url}/2.0/?method=auth.getToken`);
		expect(await ok.json()).toEqual({ method: "auth.getToken" });
		const missing = await fetch(`${mock.url}/nope`, { method: "POST", body: "x=1" });
		expect(missing.status).toBe(404);
		expect(mock.requests.map((r) => `${r.method} ${r.path} ${r.body}`)).toEqual(["GET /2.0/ ", "POST /nope x=1"]);
	});
});
