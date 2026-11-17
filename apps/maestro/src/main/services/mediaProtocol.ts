// `maestro-media://song/<videoId>` and `maestro-media://art/<videoId>`: plays downloaded songs in the offline player.
// URLs name a download by its video id, never by a path, so nothing outside the download index can be served, and
// songs kept in an older downloads folder still play (spec 2026-11-17 §5, Security).
import { createReadStream, promises as fs } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type { Session } from "electron";

export const MEDIA_SCHEME = "maestro-media";
export type MediaKind = "song" | "art";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MIME: Record<string, string> = { ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".opus": "audio/ogg", ".ogg": "audio/ogg", ".webm": "audio/webm", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export const mediaUrl = (kind: MediaKind, videoId: string) => `${MEDIA_SCHEME}://${kind}/${videoId}`;

/** The download a media URL names, or null when it is not one of ours. */
export function parseMediaUrl(url: string): { kind: MediaKind; videoId: string } | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null;
	const kind = parsed.hostname;
	if (kind !== "song" && kind !== "art") return null;
	const videoId = parsed.pathname.replace(/^\/+/, "");
	return VIDEO_ID.test(videoId) ? { kind, videoId } : null;
}

/** Serves downloads on `session` (`lookup`: the indexed file for an id), with Range support so the player can seek. */
export function registerMediaProtocol(session: Session, lookup: (kind: MediaKind, videoId: string) => string | null | undefined): void {
	if (session.protocol.isProtocolHandled(MEDIA_SCHEME)) return;
	session.protocol.handle(MEDIA_SCHEME, async (request) => {
		const target = parseMediaUrl(request.url);
		const path = target ? lookup(target.kind, target.videoId) : null;
		if (!path) return new Response("Not found", { status: 404 });
		let size: number;
		try {
			const stat = await fs.stat(path);
			if (!stat.isFile()) return new Response("Not found", { status: 404 });
			size = stat.size;
		} catch {
			return new Response("Not found", { status: 404 });
		}
		const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
		const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
		if (range && size > 0) {
			const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
			const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
			if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
			const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
			return new Response(body, {
				status: 206,
				headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" },
			});
		}
		const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
		return new Response(body, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
	});
}
