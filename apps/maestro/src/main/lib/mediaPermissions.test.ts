import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

import { allowPermissionCheck, allowPermissionRequest, isTrustedOrigin } from "./mediaPermissions";

describe("media permissions", () => {
	it("trusts YouTube Music and the app's own pages only", () => {
		expect(isTrustedOrigin("https://music.youtube.com")).toBe(true);
		expect(isTrustedOrigin("file:///C:/app/index.html")).toBe(true);
		expect(isTrustedOrigin("http://localhost:5173")).toBe(true);
		expect(isTrustedOrigin("http://music.youtube.com")).toBe(false);
		expect(isTrustedOrigin("https://accounts.google.com")).toBe(false);
		expect(isTrustedOrigin("https://evil.example")).toBe(false);
		expect(isTrustedOrigin("")).toBe(false);
		expect(isTrustedOrigin("not a url")).toBe(false);
	});
	it("never grants capture, keeps other prompts as they were", () => {
		expect(allowPermissionRequest("media")).toBe(false);
		expect(allowPermissionRequest("display-capture")).toBe(false);
		expect(allowPermissionRequest("fullscreen")).toBe(true);
		expect(allowPermissionRequest("clipboard-sanitized-write")).toBe(true);
		expect(allowPermissionRequest("speaker-selection", "https://music.youtube.com/watch")).toBe(true);
		expect(allowPermissionRequest("speaker-selection", "https://evil.example")).toBe(false);
	});
	it("lists devices and selects speakers for trusted pages only", () => {
		expect(allowPermissionCheck("media", "https://music.youtube.com")).toBe(true);
		expect(allowPermissionCheck("speaker-selection", "https://music.youtube.com")).toBe(true);
		expect(allowPermissionCheck("media", "https://www.last.fm")).toBe(false);
		expect(allowPermissionCheck("notifications", "https://www.last.fm")).toBe(true);
	});
});
