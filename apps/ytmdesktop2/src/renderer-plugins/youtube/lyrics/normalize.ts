import { artistMatchRatio } from "./match";
import type { TrackSearchInfo } from "./types";

// Bracketed title tails that never belong to the song name on lyrics sites.
const NOISE_TAIL =
	/\s*[([](?:[^)\]]*\b(?:official|video|audio|lyrics?|visuali[sz]er|remaster(?:ed)?|feat\.?|ft\.?|with|explicit|clean|radio edit|m\/?v|hd|4k|hq)\b[^)\]]*)[)\]]\s*$/i;
const FEAT_TAIL = /\s+(?:feat|ft)\.?\s.*$/i;

/** Channel-style artist names ("Artist - Topic", "ArtistVEVO", "TheWeekndVEVO") → the artist. */
export function cleanArtist(artist: string): string {
	let out = artist.trim().replace(/\s*-\s*Topic$/i, "");
	if (/VEVO$/i.test(out)) {
		out = out.replace(/\s*VEVO$/i, "");
		if (!/\s/.test(out)) out = out.replace(/([a-z])([A-Z])/g, "$1 $2");
	}
	return out.trim() || artist.trim();
}

/** "Artist - Song (Official Video) [feat. X]" → "Song". Leaves titles without noise untouched. */
export function cleanTitle(title: string, artist: string): string {
	let out = title.trim();
	const dash = out.split(/\s+[-–—]\s+/);
	if (dash.length >= 2 && artistMatchRatio(artist, dash[0]) >= 0.8) out = dash.slice(1).join(" - ");
	for (let prev = ""; prev !== out; ) {
		prev = out;
		out = out.replace(NOISE_TAIL, "");
	}
	out = out.replace(FEAT_TAIL, "").trim();
	return out || title.trim();
}

/** Search-ready copy of the player's track info (YTM titles and channel names confuse lyrics providers). */
export function cleanTrackForSearch(info: TrackSearchInfo): TrackSearchInfo {
	const artist = cleanArtist(info.artist);
	return { ...info, artist, title: cleanTitle(info.title, artist) };
}
