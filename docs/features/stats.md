# Your stats

**Status:** shipped (phase G3, 2026-10-30)
**Settings page:** Settings → Player → Your stats

## What it does
Hours listened this year and in total, your top 10 songs (plays and time) and top 10 artists, with a reset.
Counted on this computer only.

## How it works
- `stats.renderer.ts` reports, every 15 s, the seconds actually played (wall time; pauses, seeks and ads don't
  count). A play counts after 30 s of a listen.
- `src/main/trpc/routers/stats/service.ts` adds them up in `userData/listening-stats.json`, written at most once a
  minute and on quit.
