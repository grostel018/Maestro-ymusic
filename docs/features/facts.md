# About panel (song and artist facts)

**Status:** shipped (phase F3, 2026-10-30)
**Where:** the info button in the player bar

## What it does
A side panel of short cards about the playing song and its artist: Genius "behind the song", Wikipedia summaries,
the MusicBrainz release date, album, length and the artist's origin and active years, and Last.fm listeners,
plays, tags and wiki. Links open in your browser.

## How it works
- `src/main/trpc/routers/facts/service.ts` fetches (the page's CSP limits its connections), MusicBrainz at one
  request a second with a named User-Agent, and caches a week per video in `userData/facts/`.
- `src/shared/facts/cards.ts` turns the answers into cards; `facts.renderer.ts` is the button and panel.
- Last.fm needs `VITE_LASTFM_API`; Genius needs `VITE_GENIUS_TOKEN` (both in `.env.local`). Without them, Wikipedia
  and MusicBrainz still answer.

## Known limits
- Song pages are found by search; a song with a common title can match the wrong Wikipedia page.
