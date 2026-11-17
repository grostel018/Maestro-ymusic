# Offline player

**Status:** shipped (offline phase 1, 2026-11-17)
**Area:** Downloads page (`routes/downloads.tsx`) · **Settings page:** none of its own; uses Player and Audio settings · **Default:** on

## What it does
Your downloads play with the controls you have online: shuffle, repeat all or one, an Up next queue you can reorder,
autoplay from your downloads when the queue ends, speed, speaker choice, a sleep timer (minutes, end of song, or after
2/3/5 songs), keys, and wheel volume. The queue and position come back after a restart. When the connection returns,
the song keeps playing and a bar offers to go back to YouTube Music. Tray, Discord, Stream Deck, OBS, remote and the API
show the offline song and control it; Last.fm plays made offline are sent once you're back online.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.queueContinue` | `true` | Shared with online: when the queue ends, keep playing from your downloads |
| `player.keepPitch` | `true` | Shared: keep the pitch when the speed changes |
| `player.outputDevice` | `"default"` | Shared: the speaker |
| `volumeRatio.enabled` | `true` | Shared: the volume slider follows the same curve as online (slider³) |

Speed and the sleep timer are per player and not saved (DECISIONS 2026-11-17).

## How it works
- Queue and sleep logic: `src/shared/player/queue.ts`, `src/shared/player/sleep.ts` (pure; the online transitions
  plugin re-exports the sleep code).
- Player: `src/renderer/src/components/offline-player/` (`use-offline-player.ts` hook, `player-bar.tsx`,
  `queue-panel.tsx`, `sleep-menu.tsx`, `speed-menu.tsx`, `output-menu.tsx`, `shortcuts.ts`). A second muted
  `<audio preload>` holds the next song so Next starts at once.
- Saved queue: `userData/downloads-queue.json` (`downloads.getQueue` / `saveQueue`), cleaned by `restore.ts`.
- Active player: `TrackService` (`main/trpc/routers/track/service.ts`) follows the player that last started playing.
  The offline player reports through `downloads.reportTrack`; commands from tray, global shortcuts, the API and remote
  go back through `downloads.onCommand` (`shared/track/offlineTrack.ts` maps them). While offline is active, the YouTube
  Music page's own events are ignored until it plays.
- Returning connection: `downloadsOnYtmLoaded` in `main/windows/layout.ts`; Back hides the page instead of closing it
  while it has a queue.
- Last.fm backlog: `shared/track/scrobbleBacklog.ts`, saved in `userData/lastfm-backlog.json`, flushed at start and when
  YouTube Music loads again.
- Built here; ideas from ytm-rs, Namida and SimpMusic (no code). See `docs/REUSE.md`.

## Performance and safety
No timers while paused except the sleep timer's 250 ms check when it is on. Reports to main are throttled to 5 s
(immediate on song, play, volume change); the queue saves at most every 5 s. A missing file is skipped and dropped from
the queue.

## Tests
- Unit: `src/shared/player/queue.test.ts`, `src/shared/player/sleep.test.ts`, `src/shared/track/offlineTrack.test.ts`,
  `src/shared/track/scrobbleBacklog.test.ts`, `src/main/windows/layout.test.ts`,
  `src/renderer/src/components/offline-player/{restore,shortcuts}.test.ts`

## Known limits
- No Audio Lab, lyrics or karaoke offline yet (offline phases 2–3, `IMPROVEMENTS.md` 148–149).
- Like/dislike from the tray or API do nothing while the offline player is active (phase 4).
- "Try YouTube Music again" in the offline banner closes Downloads and stops the song.
