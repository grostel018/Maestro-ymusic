// `maestro-media://file/<path inside the downloads folder>`: plays downloaded songs in the offline player. Anything
// that resolves outside the downloads folder is refused (spec 2026-11-17 §5, Security).
import { createReadStream, promises as fs } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { Session } from "electron";

export const MEDIA_SCHEME = "maestro-media";
const HOST = "file";

const MIME: Record<string, string> = { ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".opus": "audio/ogg", ".ogg": "audio/ogg", ".webm": "audio/webm", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function inside(root: string, path: string): boolean {
	const rel = relative(resolve(root), path);
	return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

/** The file a media URL points at, or null when it is not one of ours or leaves `root`. */
export function resolveMediaPath(url: string, root: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== HOST) return null;
	let rel: string;
	try {
		rel = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
	} catch {
		return null;
	}
	if (!rel || isAbsolute(rel) || /^[a-z]:/i.test(rel)) return null;
	const full = resolve(root, rel);
	return inside(root, full) ? full : null;
}

/** URL for a file inside `root`, or null. */
export function mediaUrl(path: string, root: string): string | null {
	const full = resolve(path);
	if (!inside(root, full)) return null;
	const rel = relative(resolve(root), full).split(sep).join("/");
	return `${MEDIA_SCHEME}://${HOST}/${encodeURIComponent(rel)}`;
}

/** Serves downloaded files on `session`, with Range support so the player can seek. */
export function registerMediaProtocol(session: Session, getRoot: () => string): void {
	if (session.protocol.isProtocolHandled(MEDIA_SCHEME)) return;
	session.protocol.handle(MEDIA_SCHEME, async (request) => {
		const path = resolveMediaPath(request.url, getRoot());
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
