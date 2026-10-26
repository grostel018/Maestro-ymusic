# Song / Video switch

**Status:** shipped (phase C1 and C1b, 2026-10-26)
**Where:** above the player, in the player bar, and the `V` key · **Default:** Video

## What it does
- One choice, **Song** or **Video**, always visible. It's kept across restarts.
- Switching never pauses or restarts the track.
- **Song mode:**
  - It plays the track's song version at the same position, with the song's square album cover.
    The song comes from YouTube (Premium) or, without Premium, from a search of YouTube Music.
  - The queue and "Up next" stay as they were.
  - The switch's tooltip names the version found.
  - No song version: the music video keeps playing behind a square, centre-cropped cover, and
    the switch shows "No song version found".
  - Upcoming tracks follow the choice; the next track's song is looked up ahead of time.
- **Video mode on a song:** it plays the song's official music video the same way. With none,
  the Video button is disabled ("This song has no video").
- YouTube's own Song/Video switch is Premium-only and disabled otherwise, so it's hidden and ours
  takes its place.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.videoMode` | `video` | `video` or `audio` (Song) |

## How it works
- **Decisions:** `src/renderer-plugins/youtube/video-mode.logic.ts` (unit-tested).
- **Page side:** `video-mode.renderer.ts`.
  - YTM's queue mode is set with `SET_PLAYBACK_CONTENT_MODE`.
  - The song/video "twin" is looked up in the queue and "Up next" lists.
  - Without a twin, `video-mode.search.ts` searches YTM (`/search`, Songs or Videos filter) through
    the page's own client. `video-mode.match.ts` picks the result: title and artist similar, length
    10 s or less apart, the same version words (remix, live, cover…).
  - Results, misses included, are cached for 7 days in memory and `localStorage`
    (`ytmd-av-matches`). One search at a time, 4 s timeout. It searches only for the track that
    needs it (a video in Song mode, a song in Video mode), plus the next track in Song mode.
  - The found version is paired with the playing queue row, the shape YouTube uses for Premium,
    and YTM switches between the two itself (see DECISIONS.md, 2026-10-26).
  - Without a version, the picture is hidden by the `ytmd-audio-view` class.
- **Reuse:** the cover-instead-of-video approach comes from pear-desktop's `video-toggle` (MIT).

## Tests
- Unit: `video-mode.logic.test.ts`, `video-mode.match.test.ts` (real search responses in
  `fixtures/search-*.json`: a clear match, a remix trap, live versions, no result, videos),
  `video-mode.search.test.ts` (cache expiry, one request at a time, timeout).
- Bench `s20`:
  - the switch and the player-bar button are visible,
  - `V` toggles 5× with no pause and no jump back,
  - Song mode plays the song or shows the cover,
  - the choice is saved.
- Bench `s21`: Song mode on the test music video plays its song within 2 s of the position, with a
  square cover, and Up next keeps its length.
- Bench `s22`: Video mode on a song switches to its music video, or disables the Video button.

## Known limits
- **No Premium:** YouTube sends no song versions (checked on mixes and on Liked Music, signed in),
  so they are found by search. A track with no close match keeps the music video's own audio,
  which can include intros or skits that the album version doesn't have.
- **A wrong match plays a different recording.** The matcher is strict and the tooltip names the
  version found; report bad matches with both titles.
- **The position is mapped 1:1.** A music video with a long intro maps to a slightly different
  spot in the song.
- **The queue row's menu** (start mix, add to playlist) acts on the row's original video while
  its found version plays.
- **The hidden video still decodes.** Lowering its quality was tried and dropped: YouTube's quality
  change can restart the stream near 0 seconds.
- **Two player-bar layouts:** YouTube A/B-tests its player bar. The button finds its place in both
  known layouts.
