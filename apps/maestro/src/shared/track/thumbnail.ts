import { isCachableThumbUrl } from "@shared/media/appThumbUrl";

/** Best-effort remote album art URL from a track-like payload. */
export function resolveTrackThumbnailUrl(track: {
	meta?: { thumbnail?: string | null };
	video?: { thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> } };
	context?: { thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> } };
} | null | undefined): string | null {
	if (!track) return null;
	const meta = track.meta?.thumbnail?.trim();
	if (meta && isCachableThumbUrl(meta)) return meta;
	if (meta) return meta;

	const fromList = (list?: Array<{ url?: string; width?: number }>) => {
		if (!list?.length) return null;
		const sorted = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
		const url = sorted[0]?.url?.trim();
		return url || null;
	};

	return fromList(track.context?.thumbnail?.thumbnails) ?? fromList(track.video?.thumbnail?.thumbnails) ?? null;
}

type ThumbList = Array<{ url?: string; width?: number }>;

/** The artwork the window background is made from: the largest player thumbnail, else the track's meta image. */
export function resolveArtworkUrl(track: {
	meta?: { thumbnail?: string | null };
	context?: { thumbnail?: { thumbnails?: ThumbList } };
} | null | undefined): string | null {
	const list: ThumbList = track?.context?.thumbnail?.thumbnails ?? [];
	const largest = list.reduce<ThumbList[number] | null>((best, t) => (t.url && (t.width ?? 0) >= (best?.width ?? -1) ? t : best), null);
	return largest?.url?.trim() || track?.meta?.thumbnail?.trim() || null;
}

/** Square art served by Google's image CDN, asked for at 2048 px (it returns the original when that is smaller). */
export const HD_ART_PX = 2048;

/** The same artwork at high resolution: googleusercontent `=w60-h60-…` / `=s120-…` sizes become 2048 px. */
export function hdArt(url: string): string {
	if (!/googleusercontent\.com|ggpht\.com/.test(url)) return url;
	if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${HD_ART_PX}-h${HD_ART_PX}`);
	if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${HD_ART_PX}`);
	return url;
}
