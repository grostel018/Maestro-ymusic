import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_SCHEME, mediaUrl, resolveMediaPath } from "./mediaProtocol";

const root = resolve("/music/Maestro");

describe("resolveMediaPath", () => {
	it("serves a file inside the downloads folder", () => {
		expect(resolveMediaPath(`${MEDIA_SCHEME}://file/a.m4a`, root)).toBe(join(root, "a.m4a"));
		expect(resolveMediaPath(mediaUrl(join(root, "AC_DC - Back In Black.m4a"), root)!, root)).toBe(join(root, "AC_DC - Back In Black.m4a"));
	});
	it("refuses paths that leave the folder", () => {
		expect(resolveMediaPath(`${MEDIA_SCHEME}://file/..%2F..%2Fwindows%2Fwin.ini`, root)).toBeNull();
		expect(resolveMediaPath(`${MEDIA_SCHEME}://file/..%5C..%5Cwindows%5Cwin.ini`, root)).toBeNull();
		expect(resolveMediaPath(`${MEDIA_SCHEME}://file/C%3A%5CWindows%5Cwin.ini`, root)).toBeNull();
	});
	it("refuses other hosts and schemes", () => {
		expect(resolveMediaPath(`${MEDIA_SCHEME}://other/a.m4a`, root)).toBeNull();
		expect(resolveMediaPath("file:///C:/a.m4a", root)).toBeNull();
		expect(resolveMediaPath("not a url", root)).toBeNull();
	});
	it("builds no url for a file outside the folder", () => {
		expect(mediaUrl(resolve("/elsewhere/a.m4a"), root)).toBeNull();
	});
});
