# Skip non-music parts (SponsorBlock)

**Status:** shipped (phase G5, 2026-10-30)
**Settings page:** Settings → Player → General · **Default:** on

## What it does
In music videos, skips the non-music parts (intros, skits, outros), sponsor reads and self-promotion that
SponsorBlock users marked, with a short toast.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.sponsorBlock` | `true` | Skip marked parts in music videos |

## How it works
- `src/main/trpc/routers/sponsorblock/service.ts` asks SponsorBlock's privacy endpoint with only the first 4 hex
  digits of the video id's SHA-256, never the id.
- `src/shared/sponsorblock.ts`: segment merging ported from pear-desktop@7c55260:`src/plugins/sponsorblock`
  (MIT); `sponsorblock.renderer.ts` skips on `timeupdate`. Songs (ATV) are left alone.
