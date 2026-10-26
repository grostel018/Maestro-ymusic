# Song / Video switch

**Status:** shipped (phase C1, 2026-10-26)
**Where:** above the player, in the player bar, and the `V` key · **Default:** Video

## What it does
- One choice, **Song** or **Video**, always visible. It's kept across restarts.
- Switching never pauses or restarts the track.
- **Song mode:**
  - When YouTube offers the track's song version, it plays that version at the same position.
  - Otherwise the picture is replaced by the cover, and the music video keeps playing.
  - Upcoming tracks follow the choice wherever YouTube offers both versions.
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
  - Without a twin, the picture is hidden by the `ytmd-audio-view` class.
- **Reuse:** the cover-instead-of-video approach comes from pear-desktop's `video-toggle` (MIT).

## Tests
- Unit: `video-mode.logic.test.ts`.
- Bench `s20`:
  - the switch and the player-bar button are visible,
  - `V` toggles 5× with no pause and no jump back,
  - Song mode shows the cover,
  - the choice is saved.

## Known limits
- **No Premium:** YouTube sends no song versions (checked on mixes and on Liked Music, signed in).
  Song mode then shows the cover over the music video's own audio, which can include intros or
  skits that the album version doesn't have.
- **The hidden video still decodes.** Lowering its quality was tried and dropped: YouTube's quality
  change can restart the stream near 0 seconds.
- **Two player-bar layouts:** YouTube A/B-tests its player bar. The button finds its place in both
  known layouts.
