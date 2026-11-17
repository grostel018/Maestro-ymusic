import { describe, expect, it } from "vitest";
import { ScrobbleBacklog } from "./scrobbleBacklog";

const DAY = 86_400;
const entry = (videoId: string, timestamp: number) => ({ videoId, artist: "A", title: `T ${videoId}`, timestamp });

describe("ScrobbleBacklog", () => {
	it("backlog prunes and dedupes", () => {
		const now = 100 * DAY;
		const b = new ScrobbleBacklog();
		b.add(entry("old", now - 15 * DAY));
		b.add(entry("b", now - 2 * DAY));
		b.add(entry("a", now - 3 * DAY));
		b.add(entry("a", now - 3 * DAY));
		const due = b.due(now);
		expect(due.map((e) => e.videoId)).toEqual(["a", "b"]);
		b.ack([due[0]]);
		expect(b.due(now).map((e) => e.videoId)).toEqual(["b"]);
		const copy = ScrobbleBacklog.from(JSON.parse(JSON.stringify(b.toJSON())));
		expect(copy.due(now).map((e) => e.videoId)).toEqual(["b"]);
	});

	it("sends at most 50 at a time and ignores bad saved data", () => {
		const b = new ScrobbleBacklog();
		for (let i = 0; i < 60; i++) b.add(entry(`v${i}`, 1000 + i));
		expect(b.due(2000)).toHaveLength(50);
		expect(ScrobbleBacklog.from("nope").due(2000)).toEqual([]);
		expect(ScrobbleBacklog.from([{ videoId: 1 }]).due(2000)).toEqual([]);
	});
});
