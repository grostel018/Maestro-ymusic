import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseProvider } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { YtmClient } from "@main/ytm/ytm-client";
import {
	type FactCard,
	type FactsRequest,
	geniusCard,
	lastfmTrackCards,
	musicbrainzArtistCard,
	musicbrainzCard,
	pickWikiTitle,
	searchTitle,
	wikiCard,
} from "@shared/facts/cards";
import { app, net, shell } from "electron";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;
/** MusicBrainz asks for at most one request a second and a User-Agent that names the app. */
const UA = "YTMDesktop2Plus/1.0 ( https://github.com/Venipa/ytmdesktop2 )";
const SONG_HINT = /\b(song|single|track|ballad|anthem)\b/i;
const ARTIST_HINT = /\b(singer|band|rapper|musician|group|duo|dj|producer|composer|songwriter|artist)\b/i;

/**
 * Song and artist facts for the player's About panel (roadmap F3), fetched by main because the page's CSP limits
 * where the page may connect. Asked by the page (`facts:request`), answered with a push (`facts:result`). Cached a
 * week per video in userData/facts. Last.fm and Genius are used only when their keys are set (.env.local).
 */
export default class FactsProvider extends BaseProvider {
	private inflight = new Map<string, Promise<FactCard[]>>();

	constructor() {
		super("facts");
		serverMain.on("facts:request", (_ev, req: FactsRequest) => void this.answer(req));
		// "More on …" links: only https, opened in the user's browser.
		serverMain.on("facts:open", (_ev, url: unknown) => {
			if (typeof url === "string" && /^https:\/\/[^\s]+$/.test(url)) void shell.openExternal(url);
		});
	}

	private async answer(req: FactsRequest): Promise<void> {
		if (!req?.videoId || !req.title) return;
		let cards: FactCard[] = [];
		try {
			cards = await this.cards(req);
		} catch (err) {
			this.logger.warn("facts failed", err);
		}
		YtmClient.push("facts:result", { videoId: req.videoId, cards });
	}

	async cards(req: FactsRequest): Promise<FactCard[]> {
		const running = this.inflight.get(req.videoId);
		if (running) return running;
		const job = this.load(req).finally(() => this.inflight.delete(req.videoId));
		this.inflight.set(req.videoId, job);
		return job;
	}

	private cacheFile(videoId: string) {
		return path.join(app.getPath("userData"), "facts", `${videoId.replace(/[^\w-]/g, "")}.json`);
	}

	private async load(req: FactsRequest): Promise<FactCard[]> {
		const file = this.cacheFile(req.videoId);
		const fresh = await stat(file)
			.then((s) => Date.now() - s.mtimeMs < CACHE_MS)
			.catch(() => false);
		if (fresh) {
			const cached = await readFile(file, "utf8").catch(() => null);
			if (cached) return JSON.parse(cached) as FactCard[];
		}
		const cards = await this.fetchAll(req);
		await mkdir(path.dirname(file), { recursive: true }).catch(() => undefined);
		await writeFile(file, JSON.stringify(cards), "utf8").catch(() => undefined);
		return cards;
	}

	private async json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
		const res = await net.fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) throw new Error(`${res.status} ${url}`);
		return await res.json();
	}

	private async wiki(query: string, hint: RegExp, label: string): Promise<FactCard | null> {
		const search = await this.json(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=5`);
		const title = pickWikiTitle(search, hint);
		if (!title) return null;
		return wikiCard(await this.json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`), label);
	}

	private async musicbrainz(title: string, artist: string): Promise<FactCard[]> {
		const out: FactCard[] = [];
		const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
		const rec = musicbrainzCard(await this.json(`https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=1`));
		if (rec) out.push(rec);
		await new Promise((r) => setTimeout(r, 1100));
		const a = musicbrainzArtistCard(await this.json(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${artist}"`)}&fmt=json&limit=1`));
		if (a) out.push(a);
		return out;
	}

	private async lastfm(title: string, artist: string): Promise<FactCard[]> {
		const key = (import.meta.env as Record<string, string | undefined>).VITE_LASTFM_API;
		if (!key) return [];
		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&format=json&autocorrect=1&api_key=${encodeURIComponent(key)}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`;
		return lastfmTrackCards(await this.json(url));
	}

	private async genius(title: string, artist: string): Promise<FactCard | null> {
		const token = (import.meta.env as Record<string, string | undefined>).VITE_GENIUS_TOKEN;
		if (!token) return null;
		const auth = { Authorization: `Bearer ${token}` };
		const search = (await this.json(`https://api.genius.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`, auth)) as {
			response?: { hits?: Array<{ result?: { id?: number } }> };
		};
		const id = search.response?.hits?.[0]?.result?.id;
		if (!id) return null;
		return geniusCard(await this.json(`https://api.genius.com/songs/${id}?text_format=plain`, auth));
	}

	private async fetchAll(req: FactsRequest): Promise<FactCard[]> {
		const title = searchTitle(req.title);
		const artist = req.artist.replace(/\s+-\s+Topic$/i, "").trim();
		const settle = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
		const [genius, song, lastfm, mb, artistWiki] = await Promise.all([
			settle(this.genius(title, artist)),
			settle(this.wiki(`${title} ${artist} song`, SONG_HINT, "About the song")),
			settle(this.lastfm(title, artist)),
			settle(this.musicbrainz(title, artist)),
			settle(this.wiki(artist, ARTIST_HINT, `About ${artist}`)),
		]);
		const lastfmCards = lastfm ?? [];
		const cards: FactCard[] = [];
		if (genius) cards.push(genius);
		if (song) cards.push(song);
		cards.push(...lastfmCards.filter((c) => c.title === "About the song" && !song));
		cards.push(...(mb ?? []).filter((c) => c.title === "Release"));
		if (artistWiki) cards.push(artistWiki);
		cards.push(...(mb ?? []).filter((c) => c.title !== "Release"));
		cards.push(...lastfmCards.filter((c) => c.title === "On Last.fm"));
		return cards;
	}
}
