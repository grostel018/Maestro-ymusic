# C1b: real song version and cover in Song mode

**Owner report (2026-10-26):** in Song mode, C1 shows the music video's thumbnail. It should show
the real song or album cover when one exists. Video mode should show the video and its own
artwork.

**Status:** done 2026-10-26. Step 3 swaps by pairing the queue row instead of `yt-navigate`, which
rebuilt Up next (DECISIONS.md). Step 4's cover-only path remains as the fallback when no queue row
can be paired.

## Why it happens
Without Premium, YouTube never sends the song/video "twin" of a track. That was checked signed in,
on a mix and on Liked Music. C1 therefore only hides the video and shows its thumbnail.

## Idea: find the song version ourselves
The page already holds a signed-in InnerTube client, so we can search YouTube Music like the search
box does and pick the matching **song**. A song (ATV) plays free without Premium. Its result
carries the real square album art.

## Tasks
1. **Matcher** (pure, unit-tested): `video-mode.match.ts`.
   - **Input:** the playing track (title, artist, duration), plus song-search results parsed from
     the InnerTube `search` response (songs filter).
   - **Clean the title first** with `cleanTrackForSearch` (`lyrics/normalize.ts`). It strips
     "Artist - ", "(Official Video)" and feat. tails.
   - **Score** with `stringSimilarity` / `artistMatchRatio` (`lyrics/match.ts`) and a duration gap
     of 10 s or less. Accept only above a threshold; otherwise there's no match.
   - **Output:** `{ videoId, albumArtUrl (largest), album }`.
   - **Fixtures:** save 3–4 real search responses as JSON: a clear match, a remix trap, a live
     version and no result.
2. **Search call** (page world): POST `/youtubei/v1/search` with the page's `ytcfg` context and
   the songs filter.
   - It's same-origin, so the page's sign-in applies.
   - Cache by `videoId` in memory and `localStorage` for 7 days, misses included.
   - **Search only when Song mode is on.** Prefetch the next queue item once the current one is
     resolved.
   - Never more than one request in flight. A timeout of 4 s or less means no match; playback
     never waits on it.
3. **Song mode with a match:** play the song.
   - Swap to the found song at the same position. Use YTM's `yt-navigate` with `watchEndpoint
     { videoId, playlistId: current, startTimeSeconds }`.
   - The bench must prove that the queue ("Up next") survives the swap. If it doesn't, fall back
     to step 4 and record why in DECISIONS.md.
   - Then everything follows the song by itself: the player-bar cover, the window background,
     Discord and Last.fm.
4. **Song mode, swap impossible or no match:** show the cover only.
   - Put the matched album art into `#song-image` instead of the video thumbnail, and push it as
     the window background's artwork.
   - **No match at all:** show the video thumbnail cropped to a square centre (not a 16:9 frame
     with bands), and add a small "No song version found" hint on the switch.
5. **Video mode on a song (ATV):** find its music video the same way (videos filter), match by
   title and artist, and swap to it.
   - No match: disable the Video button with "This song has no video".
6. **Tests and docs:**
   - Unit: the matcher on the fixtures, and the cache expiry.
   - Bench:
     - `s21`: Song mode on the test music video ends on a song (ATV) whose square cover is shown,
       the position is within 2 s of where it was, and Up next has the same length.
     - `s22`: Video mode on a song swaps to its video, or disables the button.
   - Update `docs/features/video-mode.md` (limits) and `IMPROVEMENTS.md`, and add a
     DECISIONS.md entry.

## Risks
- **A wrong match plays the wrong song.** Mitigate with a strict threshold, the duration check and
  the cache, and show the matched title on the switch's tooltip.
- **Search requests on every track change.** They only happen in Song mode, are cached, and there's
  one per track.
- **YouTube changes its search response shape.** Parse defensively; any parse failure is treated as
  no match.

## Session handoff
Start the new session with:
> Implement docs/superpowers/plans/2026-10-26-c1b-real-song-version.md (C1b), native mode, one
> review at the end. Then continue Phase C (C2–C4) from the master roadmap.
