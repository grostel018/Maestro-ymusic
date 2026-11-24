import { describe, expect, it } from "vitest";
import { buildArgs, type DownloadJob, isVideoId, isYoutubeImageUrl, netscapeCookies, parseFinalPath, parseProgress, parseSha256Sums, safeFileName } from "./core";

const job: DownloadJob = { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" };
const paths = { ffmpeg: "C:/bin/ffmpeg", jsRuntime: "deno:C:/bin/deno.exe", cookies: null, outDir: "C:/Music/Maestro" };

describe("isVideoId", () => {
	it("accepts 11-character ids only", () => {
		expect(isVideoId("dQw4w9WgXcQ")).toBe(true);
		expect(isVideoId("../../x")).toBe(false);
		expect(isVideoId("dQw4w9WgXcQ&list=x")).toBe(false);
	});
});

describe("safeFileName", () => {
	it("replaces characters Windows refuses", () => {
		expect(safeFileName("AC/DC", "Back In Black", "m4a")).toBe("AC_DC - Back In Black.m4a");
		expect(safeFileName("A", 'Why? "Now": <yes>|*', "m4a")).toBe("A - Why_ _Now__ _yes___.m4a");
	});
	it("avoids reserved names and trailing dots", () => {
		expect(safeFileName("CON", "", "m4a")).toBe("_CON.m4a");
		expect(safeFileName("CON", "x", "m4a")).toBe("CON - x.m4a");
		expect(safeFileName("", "nul", "m4a").startsWith("_")).toBe(true);
		expect(safeFileName("Artist", "Song...", "m4a")).toBe("Artist - Song.m4a");
	});
	it("caps the length", () => {
		expect(safeFileName("A".repeat(300), "B".repeat(300), "m4a").length).toBeLessThanOrEqual(184);
	});
});

describe("buildArgs", () => {
	it("downloads the song's best audio as a tagged file", () => {
		const args = buildArgs(job, paths);
		expect(args[0]).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
		expect(args).toContain("--no-playlist");
		expect(args).toContain("--embed-metadata");
		expect(args).toContain("--embed-thumbnail");
		expect(args[args.indexOf("-f") + 1]).toBe("bestaudio[ext=m4a]/bestaudio");
		expect(args[args.indexOf("--js-runtimes") + 1]).toBe("deno:C:/bin/deno.exe");
		// A cut-off download must stay a .part file, never look finished.
		expect(args).not.toContain("--no-part");
		// Paths with Greek letters or accents came back mangled without it (Windows console code page).
		expect(args[args.indexOf("--encoding") + 1]).toBe("utf-8");
		expect(args[args.indexOf("--ffmpeg-location") + 1]).toBe("C:/bin/ffmpeg");
		expect(args[args.indexOf("-o") + 1]).toBe("C:/Music/Maestro/Rick Astley - Never Gonna Give You Up.%(ext)s");
	});
	it("passes cookies only when given", () => {
		expect(buildArgs(job, paths)).not.toContain("--cookies");
		const args = buildArgs(job, { ...paths, cookies: "C:/tmp/c.txt" });
		expect(args[args.indexOf("--cookies") + 1]).toBe("C:/tmp/c.txt");
	});
	it("adds the video id to the name when another song already has it", () => {
		const args = buildArgs(job, paths, { withId: true });
		expect(args[args.indexOf("-o") + 1]).toBe("C:/Music/Maestro/Rick Astley - Never Gonna Give You Up [dQw4w9WgXcQ].%(ext)s");
	});
	it("keeps a % in a title from being read as a template field", () => {
		const args = buildArgs({ ...job, title: "100%(live)" }, paths);
		expect(args[args.indexOf("-o") + 1]).toBe("C:/Music/Maestro/Rick Astley - 100%%(live).%(ext)s");
	});
	it("refuses an invalid id", () => {
		expect(() => buildArgs({ ...job, videoId: "../../x" }, paths)).toThrow();
	});
});

describe("yt-dlp output", () => {
	it("reads progress lines", () => {
		expect(parseProgress("[maestro] 512/1024")).toBe(50);
		expect(parseProgress("[maestro] 10/NA")).toBeNull();
		expect(parseProgress("[download] Destination: x")).toBeNull();
	});
	it("reads the final file path", () => {
		expect(parseFinalPath("[maestro-file] C:/Music/Maestro/A - B.m4a")).toBe("C:/Music/Maestro/A - B.m4a");
		expect(parseFinalPath("[maestro] 1/2")).toBeNull();
	});
});

describe("parseSha256Sums", () => {
	it("finds the hash of one asset", () => {
		const text = `${"a".repeat(64)}  yt-dlp\n${"b".repeat(64)}  yt-dlp.exe\n`;
		expect(parseSha256Sums(text, "yt-dlp.exe")).toBe("b".repeat(64));
		expect(parseSha256Sums(text, "missing.exe")).toBeNull();
	});
	it("accepts a checksum file holding only the hash", () => {
		expect(parseSha256Sums(`${"d".repeat(64)}
`, "deno.zip")).toBe("d".repeat(64));
	});
	it("reads PowerShell's Get-FileHash output (Deno publishes that)", () => {
		const crlf = String.fromCharCode(13, 10);
		const text = ["Algorithm : SHA256", "Hash      : CBA84B26E0DF5AE7F74FC66B86A95B866872A86292EBD84FA1E959927EDD93BF", "Path      : C:\\a\\release\\deno-x86_64-pc-windows-msvc.zip", ""].join(crlf);
		expect(parseSha256Sums(text, "deno-x86_64-pc-windows-msvc.zip")).toBe("cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf");
		expect(parseSha256Sums(text, "other.zip")).toBeNull();
	});
	it("accepts the binary-mode marker", () => {
		expect(parseSha256Sums(`${"c".repeat(64)} *ffmpeg.zip`, "ffmpeg.zip")).toBe("c".repeat(64));
	});
});

describe("netscapeCookies", () => {
	it("writes YouTube cookies in the Netscape format", () => {
		const text = netscapeCookies([
			{ name: "SID", value: "v1", domain: ".youtube.com", path: "/", secure: true, expirationDate: 2000000000 },
			{ name: "x", value: "v2", domain: ".example.com", path: "/", secure: false },
		]);
		expect(text.startsWith("# Netscape HTTP Cookie File")).toBe(true);
		expect(text).toContain(".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tv1");
		expect(text).not.toContain("example.com");
	});
});

describe("isYoutubeImageUrl", () => {
	it("accepts YouTube's own image servers over https", () => {
		expect(isYoutubeImageUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")).toBe(true);
		expect(isYoutubeImageUrl("https://lh3.googleusercontent.com/abc=w544-h544")).toBe(true);
		expect(isYoutubeImageUrl("https://yt3.ggpht.com/abc=s176")).toBe(true);
	});

	it("rejects anything else", () => {
		expect(isYoutubeImageUrl("http://i.ytimg.com/vi/x/hq.jpg")).toBe(false);
		expect(isYoutubeImageUrl("https://evil.example/i.ytimg.com.jpg")).toBe(false);
		expect(isYoutubeImageUrl("https://i.ytimg.com.evil.example/a.jpg")).toBe(false);
		expect(isYoutubeImageUrl("https://127.0.0.1/a.jpg")).toBe(false);
		expect(isYoutubeImageUrl("https://user@i.ytimg.com:8443/a.jpg")).toBe(false);
		expect(isYoutubeImageUrl("not a url")).toBe(false);
	});
});
