// Song and artist facts (roadmap F3): turns public API answers into short cards. Pure, so the main service stays a
// thin fetcher. Sources: Wikipedia REST summaries, MusicBrainz, Last.fm and (with a token) Genius.

export type FactCard = { source: "Wikipedia" | "MusicBrainz" | "Last.fm" | "Genius"; title: string; text: string; url?: string };
export type FactsRequest = { videoId: string; title: string; artist: string; album?: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** First sentences of `text`, at most `max` characters, cut at a sentence end when possible. */
export function shorten(text: string, max = 420): string {
	const t = text.replace(/\s+/g, " ").trim();
	if (t.length <= max) return t;
	const cut = t.slice(0, max);
	const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
	return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/** Strips Last.fm's "Read more on Last.fm" link and HTML from a wiki summary. */
export function stripLastfm(html: string): string {
	return html
		.replace(/<a [^>]*>Read more on Last\.fm<\/a>\.?/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/&#39;/g, "'")
		.trim();
}

/** A Wikipedia REST `page/summary` answer, or null for disambiguation and missing pages. */
export function wikiCard(summary: unknown, title: string): FactCard | null {
	const s = obj(summary);
	if (s.type === "disambiguation" || !str(s.extract)) return null;
	const url = str(obj(obj(s.content_urls).desktop).page) || undefined;
	return { source: "Wikipedia", title, text: shorten(str(s.extract)), url };
}

/** Wikipedia title search: the best page title whose description suggests music, or the first hit. */
export function pickWikiTitle(search: unknown, hint: RegExp): string | null {
	const pages = Array.isArray(obj(search).pages) ? (obj(search).pages as unknown[]) : [];
	const rows = pages.map(obj);
	const musical = rows.find((p) => hint.test(`${str(p.description)} ${str(p.excerpt)}`));
	return str((musical ?? rows[0])?.key) || null;
}

/** MusicBrainz recording search → release date, album and length. */
export function musicbrainzCard(search: unknown): FactCard | null {
	const rec = obj((obj(search).recordings as unknown[] | undefined)?.[0]);
	if (!str(rec.title)) return null;
	const parts: string[] = [];
	const date = str(rec["first-release-date"]);
	if (date) parts.push(`First released ${date}`);
	const release = obj((rec.releases as unknown[] | undefined)?.[0]);
	if (str(release.title)) parts.push(`on "${str(release.title)}"`);
	const ms = Number(rec.length);
	if (Number.isFinite(ms) && ms > 0) parts.push(`(${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")})`);
	if (!parts.length) return null;
	const id = str(rec.id);
	return { source: "MusicBrainz", title: "Release", text: `${parts.join(" ")}.`, url: id ? `https://musicbrainz.org/recording/${id}` : undefined };
}

/** MusicBrainz artist search → origin and active years. */
export function musicbrainzArtistCard(search: unknown): FactCard | null {
	const a = obj((obj(search).artists as unknown[] | undefined)?.[0]);
	if (!str(a.name)) return null;
	const parts: string[] = [];
	const type = str(a.type);
	const area = str(obj(a.area).name);
	const span = obj(a["life-span"]);
	const begin = str(span.begin);
	const end = str(span.end);
	if (type) parts.push(type === "Group" ? "A group" : type === "Person" ? "An artist" : type);
	if (area) parts.push(`from ${area}`);
	if (begin) parts.push(span.ended === true && end ? `active ${begin.slice(0, 4)}–${end.slice(0, 4)}` : `active since ${begin.slice(0, 4)}`);
	if (parts.length < 2) return null;
	const id = str(a.id);
	return { source: "MusicBrainz", title: str(a.name), text: `${parts.join(", ")}.`, url: id ? `https://musicbrainz.org/artist/${id}` : undefined };
}

/** Last.fm track.getInfo → listeners, plays, tags and the wiki summary. */
export function lastfmTrackCards(info: unknown): FactCard[] {
	const t = obj(obj(info).track);
	if (!str(t.name)) return [];
	const out: FactCard[] = [];
	const listeners = Number(t.listeners);
	const plays = Number(t.playcount);
	const tags = ((obj(t.toptags).tag as unknown[] | undefined) ?? [])
		.map((x) => str(obj(x).name))
		.filter(Boolean)
		.slice(0, 5);
	const stats: string[] = [];
	if (Number.isFinite(listeners) && listeners > 0) stats.push(`${listeners.toLocaleString("en-US")} listeners`);
	if (Number.isFinite(plays) && plays > 0) stats.push(`${plays.toLocaleString("en-US")} plays`);
	if (tags.length) stats.push(`tagged ${tags.join(", ")}`);
	if (stats.length) out.push({ source: "Last.fm", title: "On Last.fm", text: `${stats.join(" · ")}.`, url: str(t.url) || undefined });
	const wiki = stripLastfm(str(obj(t.wiki).summary));
	if (wiki.length > 40) out.push({ source: "Last.fm", title: "About the song", text: shorten(wiki), url: str(t.url) || undefined });
	return out;
}

/** Genius song (text_format=plain) → its description. */
export function geniusCard(song: unknown): FactCard | null {
	const s = obj(obj(obj(song).response).song);
	const text = str(obj(s.description).plain);
	if (!text || text === "?") return null;
	return { source: "Genius", title: "Behind the song", text: shorten(text), url: str(s.url) || undefined };
}

/** Cleans a YouTube title for search: drops "(Official Video)", "[4K]", "ft. …" and the like. */
export function searchTitle(title: string): string {
	return title
		.replace(/[([](?:official|lyric|music|audio|video|visuali[sz]er|hd|4k|remaster|live)[^)\]]*[)\]]/gi, "")
		.replace(/\s+(?:ft\.?|feat\.?|featuring)\s.+$/i, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}
