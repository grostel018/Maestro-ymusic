# Ad block

**Status:** shipped (phase 1, 2026-10-25)
**Area / plugin id:** `adblock` · **Settings page:** Settings → Player → Ad block · **Default:** on

## What it does
Removes YouTube Music's audio and video ads and the Premium pop-ups, signed in or not, without
Premium. Your watch history and recommendations keep working.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `adblock.enabled` | `true` | Master switch (the pruning part needs a restart to turn off) |
| `adblock.network` | `true` | Block ad and tracker servers |
| `adblock.prune` | `true` | Remove ads from YouTube's responses (restart required) |
| `adblock.fallback` | `true` | Mute and skip any ad that slips through (live) |
| `adblock.hideUpsells` | `true` | Hide Premium banners and dialogs |
| `adblock.stats.total` | `0` | All-time counter (saved every 60 s and on quit) |

## How it works
1. **Network** (`src/main/trpc/routers/adblock/`):
   - Ghostery's ads + tracking lists on the default session.
   - Cosmetic filters are off, because our own CSS does that part.
   - The engine is cached in the profile and refreshed weekly. A failed refresh keeps the old
     engine.
   - YouTube's watch-history endpoints are allow-listed (`HISTORY_ALLOW_FILTERS` in
     `engine.ts`).
   - Attached before the window is created, waiting at most 3 s.
2. **Response pruning** (`src/shared/adblock/prune.ts`, injected by `src/preload/adblock-prune.ts`):
   - Runs before YouTube's scripts.
   - Wraps `JSON.parse`, `Response.json` and the `ytInitial*` setters.
   - Deletes `adPlacements`, `playerAds`, `adSlots` and `adBreakHeartbeatParams`, plus
     anti-adblock messages.
3. **Fallback** (`src/renderer-plugins/youtube/adblock.renderer.ts`):
   - When the player shows `ad-showing`, it mutes, plays at 16× and clicks Skip.
   - When the ad ends, it restores every video element it touched.
   - It also hides upsell elements with CSS.

## Performance and safety
- Each layer catches its own errors and passes through, so playback is never blocked.
- The fallback watches only `#movie_player`'s class attribute.

## Tests
- Unit:
  - `src/shared/adblock/prune.test.ts`
  - `src/preload/adblock-prune.test.ts`
  - `src/main/trpc/routers/adblock/engine.test.ts`
  - `src/shared/adblock/flag.test.ts`
- Bench:
  - `s5` network (smoke)
  - `s6` prune
  - `s7` fallback (smoke)
  - `s8` upsells
  - `s12` settings page

## Known limits
- YouTube changes its ad delivery from time to time. Watch `s6` and `s7`.
- Turning pruning off needs a restart.
