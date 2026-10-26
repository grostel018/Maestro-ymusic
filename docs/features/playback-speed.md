# Playback speed

**Status:** shipped (phase C4, 2026-10-26)
**Where:** the speed button in the player bar ("1×"), the video controls, and `<` / `>` · **Default:** 1×, keep pitch on

## What it does
- Presets from 0.25× to 2×, plus a custom slider from 0.25× to 3×.
- It works in Song and Video mode, and holds for the session: every new track starts at the chosen
  speed.
- **Keep pitch** (on by default) keeps voices at their normal pitch when the speed changes. Off,
  faster playback also sounds higher, like a record. A real pitch shift comes with D6.
- Ads are left alone: the ad skipper sets its own rate while one shows.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.keepPitch` | `true` | Keep the pitch when the speed changes (`preservesPitch`) |

The speed itself isn't saved, so a restart is back at 1×.

## How it works
- `src/renderer-plugins/youtube/playback-speed.ts` holds the rate and puts it on the `<video>`
  element directly, so any rate works (the player API only takes its presets).
- `playback-speed.renderer.ts` adds the player-bar button and puts the rate back when a new source
  loads. Right after a load or an ad, a drop to 1× is YouTube resetting the rate and is undone;
  any other rate change (the ad skipper restoring the rate from before the ad, say) is adopted.
- **Reuse:** the approach of pear-desktop's `playback-speed` plugin (MIT).

## Tests
- Unit: speed steps and limits in `video-controls.logic.test.ts`.
- Bench `s25` (Song mode): 1.25× from the player-bar menu keeps playing, keep pitch off clears
  `preservesPitch` and is saved, and the rate stays.
