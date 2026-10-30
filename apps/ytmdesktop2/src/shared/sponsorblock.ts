// Ported from pear-desktop@7c55260:src/plugins/sponsorblock/segments.ts (MIT): `mergeSegments` is its sortSegments
// (sort, then merge overlaps), on a copy. Added: the hashed-prefix answer reader and the segment lookup.

export type Segment = [number, number];

/** Sorted, with overlapping or touching segments merged. */
export function mergeSegments(input: readonly Segment[]): Segment[] {
	const segments = input.map((s) => [s[0], s[1]] as Segment).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
	const out: Segment[] = [];
	let cur: Segment | undefined;
	for (const s of segments) {
		if (!cur) {
			cur = s;
			continue;
		}
		if (cur[1] < s[0]) {
			out.push(cur);
			cur = s;
			continue;
		}
		cur[1] = Math.max(cur[1], s[1]);
	}
	if (cur) out.push(cur);
	return out;
}

/**
 * Reads SponsorBlock's privacy endpoint answer (`/api/skipSegments/<sha256 prefix>`): every video whose hash starts
 * with the prefix; keeps `videoId`'s skip segments.
 */
export function segmentsFor(answer: unknown, videoId: string): Segment[] {
	if (!Array.isArray(answer)) return [];
	const video = answer.find((v) => (v as { videoID?: unknown })?.videoID === videoId) as { segments?: unknown } | undefined;
	const list = Array.isArray(video?.segments) ? video.segments : [];
	const raw = list
		.filter((s) => {
			const action = (s as { actionType?: unknown }).actionType;
			return action === undefined || action === "skip";
		})
		.map((s) => (s as { segment?: unknown }).segment)
		.filter((s): s is Segment => Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === "number" && Number.isFinite(n)) && s[1] > s[0]);
	return mergeSegments(raw);
}

/** The segment covering `t` (seconds), if any. */
export function segmentAt(segments: readonly Segment[], t: number): Segment | null {
	for (const s of segments) if (t >= s[0] && t < s[1]) return s;
	return null;
}
