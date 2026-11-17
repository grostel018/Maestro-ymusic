import { describe, expect, it } from "vitest";
import { MEDIA_SCHEME, mediaUrl, parseMediaUrl } from "./mediaProtocol";

describe("media URLs", () => {
	it("name a song or its cover by video id, wherever the file is", () => {
		expect(mediaUrl("song", "dQw4w9WgXcQ")).toBe(`${MEDIA_SCHEME}://song/dQw4w9WgXcQ`);
		expect(parseMediaUrl(mediaUrl("song", "dQw4w9WgXcQ"))).toEqual({ kind: "song", videoId: "dQw4w9WgXcQ" });
		expect(parseMediaUrl(mediaUrl("art", "dQw4w9WgXcQ"))).toEqual({ kind: "art", videoId: "dQw4w9WgXcQ" });
	});
	it("refuse paths, other hosts and other schemes", () => {
		expect(parseMediaUrl(`${MEDIA_SCHEME}://song/..%2F..%2Fwindows%2Fwin.ini`)).toBeNull();
		expect(parseMediaUrl(`${MEDIA_SCHEME}://file/a.m4a`)).toBeNull();
		expect(parseMediaUrl(`${MEDIA_SCHEME}://song/dQw4w9WgXcQ/extra`)).toBeNull();
		expect(parseMediaUrl("file:///C:/a.m4a")).toBeNull();
		expect(parseMediaUrl("not a url")).toBeNull();
	});
});
