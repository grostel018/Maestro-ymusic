# Video controls

**Status:** shipped (phase C2, 2026-10-26)
**Where:** a bar at the bottom of the video, shown on hover in Video mode · **Default:** on

## What it does
- **Play and time:** play/pause and "0:42 / 3:34".
- **Speed:** presets from 0.25× to 2×, a custom slider, and keep pitch. It's the same menu as the
  player-bar speed button (see [playback-speed.md](playback-speed.md)).
- **Subtitles:** off, or any language the video has; auto-generated tracks are listed last.
- **Quality:** every level the stream offers, up to 2160p, plus Auto. The choice is saved as the
  preferred resolution (`player.res`), so later videos start at it. If YouTube restarts the stream
  when the quality changes, the position is put back.
- **Loop:** repeats the current track (YTM's own repeat-one).
- **Picture-in-picture**, **theater** (the video fills the window; `t` or Esc leaves it) and
  **full screen**.
- **YouTube's keys**, live only after a click on the video and until a click elsewhere, so they
  never clash with typing or with YouTube Music's own keys:

  | Key | Action |
  |---|---|
  | `k`, Space | Play / pause |
  | `j` / `l` | Back / forward 10 s |
  | ← / → | Back / forward 5 s |
  | `,` / `.` | One frame back / forward (pauses) |
  | `<` / `>` | Slower / faster |
  | `0`–`9` | Jump to 0–90 % |
  | `f` | Full screen |
  | `m` | Mute |
  | `c` | Subtitles on / off |
  | `i` | Picture-in-picture |
  | `t` | Theater mode |
  | Esc | Leave theater mode |

  In theater and full screen the keys are always live.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.videoControls` | `true` | Show the bar and enable the keys (Settings → Player → Video) |

## How it works
- **Decisions:** `src/renderer-plugins/youtube/video-controls.logic.ts` (unit-tested): the key map,
  speed steps, quality order and labels, time format, caption list.
- **Page side:** `video-controls.renderer.ts`, with menus from `video-controls.menu.ts`.
- **Why our own bar:** YTM builds its player without YouTube's control bar. `.ytp-chrome-bottom`
  and every `.ytp-*-button` are absent, not hidden (probe, DECISIONS.md 2026-10-26). The bar
  drives the player API instead: `setPlaybackQualityRange`, the `captions` module options,
  `requestPictureInPicture` and `requestFullscreen` on `#movie_player`.
- **Cost:** nothing while the pointer is away. The time only updates while the bar is visible.
- **Reuse:** the controls follow pear-desktop's `quality-changer`, `captions-selector`,
  `playback-speed` and `picture-in-picture` plugins (MIT) in what they call; no code was ported.

## Tests
- Unit: `video-controls.logic.test.ts`.
- Bench `s23`:
  - the bar shows on hover,
  - keys do nothing before the player is clicked,
  - `l`/`j` seek, `<`/`>` change the speed, `c` toggles captions, `m` mutes,
  - 1080p is set from the menu without jumping back and is saved,
  - `i` opens and closes picture-in-picture,
  - `t` fills the window and Esc leaves it,
  - `f` enters and leaves full screen,
  - playback never pauses.

## Known limits
- Captions auto-translate isn't offered yet (IMPROVEMENTS.md item 4).
- In Song mode the bar is hidden; speed lives on the player bar there.
