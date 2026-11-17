# Offline player — phase 1 (player basics, sleep timer, integrations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Downloads player gets repeat, a shuffle toggle, a real queue, autoplay, speed, speaker choice, shortcuts
and the sleep timer. It keeps playing when the connection returns, and tray/Discord/Last.fm/stats/API follow it.

**Architecture:** Pure queue and sleep-timer logic in `src/shared/player/`, unit-tested once. The Downloads route
uses it through a `useOfflinePlayer` hook. Main tracks the active player, so integrations and global shortcuts read
from it and send their commands to it. The online YTM page plugins change only to import the moved sleep-timer code.

**Tech Stack:** Electron, React, TanStack Router, tRPC, Vitest, TypeScript. pnpm 11.15.1, Node ≥ 24.14, Windows.

**Spec:** `docs/superpowers/specs/2026-11-17-offline-player-parity-design.md` (feature rows #2–#9, #16, #25,
#28–#30, #37, #38 and the "Design notes" section). Phases 2–5 get their own plans.

## Global Constraints

- Roadmap §1.4: playback never stalls or goes silent; startup never waits > 3 s on the network.
- While building: `pnpm t:unit` and `pnpm typecheck` only. No app launch until Task 6.
- Conventional Commits with a scope (`feat(offline): …`), on a `feature/offline-player-p1` branch, lefthook runs, never `--no-verify`, never push without the owner's OK.
- Don't commit `services.generated.d.ts` unless a service was added (none is; `track`, `downloads` and `lastfm` are extended).
- One player at a time: starting one pauses the other (unchanged rule).
- API/remote schema: additive only (`source?: "online" | "offline"`); nothing removed or retyped.
- Settings reused, no new switches: `player.queueContinue` drives offline autoplay, `player.keepPitch` and `player.outputDevice` are shared.
- No code from GPL/EULA clients (ytm-rs, SimpMusic, Harmony, Namida).

## Review Focus

- Connection flaps several times during one offline song → the song never stops and Downloads never closes (Task 2 test `flapping connection keeps downloads`).
- A downloaded file is deleted while it is queued or saved → it's skipped, the queue continues, and restore drops it (Task 4 test `missing item is dropped on restore`).
- Repeat-one plus Next: Next moves to the next song, and repeat-one only replays when the song ends (Task 1 test `next ignores repeat one`).
- Sleep timer "after N songs" when the user skips → only songs that end or are skipped past count, and Previous never counts (Task 1 test `skip counts, previous does not`).
- Last.fm while offline for days → plays older than 14 days are dropped, the rest are sent oldest first when online, and nothing is sent twice (Task 3 test `backlog prunes and dedupes`).

---

### Task 1: Shared queue and sleep-timer logic

**Files:**
- Create: `apps/maestro/src/shared/player/queue.ts`, `apps/maestro/src/shared/player/sleep.ts`
- Test: `apps/maestro/src/shared/player/queue.test.ts`, `apps/maestro/src/shared/player/sleep.test.ts`
- Modify: `apps/maestro/src/renderer-plugins/youtube/audio-engine/transitions.logic.ts`: re-export `SleepTimer`, `sleepAction`, `sleepLabel` from `@shared/player/sleep`, so the online plugin works unchanged.

**Interfaces:**
- Produces (`queue.ts`), all pure and immutable:
  - `type Repeat = "off" | "all" | "one"`
  - `type QueueState = { order: string[]; base: string[]; pos: number; repeat: Repeat; shuffle: boolean }` (`base` is the unshuffled order)
  - `createQueue(ids: string[], startId?: string, shuffle?: boolean, rnd?: () => number): QueueState`
  - `next(q: QueueState, reason: "ended" | "skip"): QueueState | null`. `null` means the queue is over.
  - `prev(q: QueueState): QueueState`
  - `setRepeat(q, r: Repeat)`, `toggleShuffle(q, rnd?)` (the current song stays current)
  - `playNext(q, ids: string[])`, `addToQueue(q, ids: string[])`, `move(q, from: number, to: number)`, `removeAt(q, i: number)`
  - `pruneMissing(q, exists: (id: string) => boolean): QueueState | null`
  - `pickAutoplay(lastId: string, all: { videoId: string; artist: string }[], played: Set<string>, rnd?): string[]`
- Produces (`sleep.ts`):
  - `type SleepTimer = { kind: "off" } | { kind: "at"; endsAt: number } | { kind: "end-of-track" } | { kind: "after-songs"; left: number }`
  - `sleepAction(timer, now, remaining, fading)` and `sleepLabel(timer, now)`: the same behaviour as today for the existing kinds
  - `onSongBoundary(timer: SleepTimer, reason: "ended" | "skip" | "prev"): { timer: SleepTimer; stop: boolean }`

- [ ] **Step 1: Write the failing tests**
  - `queue.test.ts`:
    - `repeat off ends`: `next` on the last song returns `null`.
    - `repeat all wraps`: `next` on the last song gives `pos` 0.
    - `repeat one replays on ended`: same `pos` for reason `"ended"`.
    - `next ignores repeat one`: reason `"skip"` advances.
    - `prev at start stays at 0`.
    - `toggle shuffle keeps current`: same current id; the order is a permutation of `base`. Toggling back restores `base` order from the current song.
    - `playNext inserts after pos`. `addToQueue appends`. `move` and `removeAt` keep the current id current.
    - `pruneMissing drops ids and keeps current when it exists`, and returns `null` when nothing is left.
    - `pickAutoplay`: with seeded `rnd`, never returns played ids, puts same-artist ids first, and returns `[]` when all are played.
  - `sleep.test.ts`:
    - The existing sleep cases from `transitions.logic.test.ts`, moved here.
    - `after-songs 2`: ended → `{ left: 1 }, stop: false`; ended again → `stop: true`.
    - `skip counts, previous does not`.

- [ ] **Step 2: Run them and make sure they fail**
  Run: `pnpm t:unit apps/maestro/src/shared/player`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `queue.ts` and `sleep.ts`**
  Move the sleep-timer code from `transitions.logic.ts` into `sleep.ts` and re-export it. Shuffle is a Fisher–Yates using `rnd` (default `Math.random`).

- [ ] **Step 4: Run all unit tests and typecheck**
  Run: `pnpm t:unit && pnpm typecheck`. Expected: PASS (online transitions tests still green).

- [ ] **Step 5: Commit**
  `git commit -m "feat(offline): shared queue and sleep-timer logic"`

### Task 2: Downloads keeps playing when the connection returns

**Files:**
- Modify: `apps/maestro/src/main/windows/layout.ts`: add a pure decision function.
- Modify: `apps/maestro/src/main/windows/windowManager.ts:225-275`: `openDownloads`, `closeDownloads`, `did-finish-load`.
- Modify: `apps/maestro/src/main/trpc/routers/downloads/{router,service}.ts`: `reportPlayer`, `onOnline`, `hidePage`.
- Modify: `apps/maestro/src/renderer/src/routes/downloads.tsx`: the back-online bar and the Back button.
- Test: `apps/maestro/src/main/windows/layout.test.ts` (create it if it doesn't exist).

**Interfaces:**
- Produces:
  - `downloadsOnYtmLoaded(s: { openedForOffline: boolean; hasQueue: boolean }): "close" | "stay-and-announce" | "stay"`
  - tRPC `downloads.reportPlayer.mutate({ hasQueue: boolean; playing: boolean })`
  - `downloads.onOnline` subscription (fires when YTM loaded cleanly while Downloads is open)
  - `downloads.hidePage.mutate()`: pauses offline playback, then detaches the view **without** closing its webContents

- [ ] **Step 1: Write the failing test**
  `layout.test.ts`:
  - openedForOffline + !hasQueue → `"close"`.
  - openedForOffline + hasQueue → `"stay-and-announce"`.
  - !openedForOffline → `"stay"`.
  - `flapping connection keeps downloads`: a sequence of fail/finish loads with `hasQueue` true never yields `"close"`.

- [ ] **Step 2: Run it and make sure it fails**
  Run: `pnpm t:unit apps/maestro/src/main/windows`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - The function itself.
  - `windowManager` keeps `downloadsHasQueue` from `reportPlayer` and uses the function on `did-finish-load`.
  - Back calls `hidePage` when there is a queue, otherwise `closePage` as today.
  - `openDownloads` re-attaches a kept view.
  - The page shows "You're back online · Go to YouTube Music" on `onOnline`.

- [ ] **Step 4: Run all unit tests and typecheck**
  Run: `pnpm t:unit && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "fix(offline): keep playing downloads when YouTube Music comes back"`

### Task 3: Active player and integrations

**Files:**
- Create: `apps/maestro/src/shared/track/offlineTrack.ts`, `apps/maestro/src/shared/track/scrobbleBacklog.ts`
- Test: `apps/maestro/src/shared/track/offlineTrack.test.ts`, `apps/maestro/src/shared/track/scrobbleBacklog.test.ts`
- Modify: `apps/maestro/src/main/trpc/routers/track/service.ts`: active player, offline ingest, command routing.
- Modify: `apps/maestro/src/main/trpc/routers/lastfm/service.ts`: backlog queue and flush.
- Modify: `apps/maestro/src/main/api/server.ts`: emit the `source` field.
- Modify: `apps/maestro/src/main/trpc/routers/downloads/{router,service}.ts`: `reportTrack`, `onCommand`.

**Interfaces:**
- Consumes: the Downloads `Item` shape from the `downloads.list` query.
- Produces:
  - `offlineTrackData(item: { videoId: string; title: string; artist: string; album?: string; durationSec?: number }, startedAt: number): TrackData`. Thumbnail is `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; `meta.source = "offline"`.
  - `type ScrobbleEntry = { videoId: string; artist: string; title: string; album?: string; durationSec?: number; timestamp: number }`
  - `class ScrobbleBacklog` with:
    - `add(e: ScrobbleEntry)`
    - `due(now: number): ScrobbleEntry[]`: oldest first; drops entries older than 14 days; returns at most 50
    - `ack(entries: ScrobbleEntry[])`
    - `toJSON()` and `static from(json: unknown)`
  - Persisted at `userData/lastfm-backlog.json`.
  - TrackService: `activePlayer: "online" | "offline"`, set by whichever player last reported `playing: true`.
  - TrackService: `ingestOffline(state: { item; playing: boolean; position: number })` runs the same emit path as `onTrackInfo` and `onPlayStateChange`.
  - TrackService: `executeCommand` (used by tray, global shortcuts, API, Stream Deck, remote) sends to `downloads.onCommand` when `activePlayer === "offline"`.
  - tRPC `downloads.reportTrack.mutate({ videoId: string; playing: boolean; position: number })`
  - `downloads.onCommand` subscription: `{ command: "play" | "pause" | "toggle" | "next" | "prev" | "seek" | "volume"; value?: number }`

- [ ] **Step 1: Write the failing tests**
  - `offlineTrack.test.ts`: `offlineTrackData` gives a `TrackData` whose `video.videoId`, `video.title`, `video.author`, `meta.duration`, `meta.thumbnail` and `meta.source` match.
  - `scrobbleBacklog.test.ts`:
    - `backlog prunes and dedupes`: an entry 15 days old is dropped; the same videoId+timestamp added twice is sent once; `ack` removes the acked entries; round-trips through `toJSON`/`from`.

- [ ] **Step 2: Run them and make sure they fail**
  Run: `pnpm t:unit apps/maestro/src/shared/track`. Expected: FAIL.

- [ ] **Step 3: Implement the modules, then wire them in**
  - A Last.fm scrobble goes into the backlog when the client call fails.
  - The backlog flushes on startup and on `downloads.onOnline`.
  - Stats should need no change once offline plays go through the `track:change` path; confirm this in `stats/service.ts`.

- [ ] **Step 4: Run all unit tests and typecheck**
  Run: `pnpm t:unit && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(offline): integrations follow the offline player; Last.fm catches up online"`

### Task 4: Offline queue: repeat, shuffle, up next, autoplay, saved queue, preload

**Files:**
- Create: `apps/maestro/src/renderer/src/components/offline-player/use-offline-player.ts`
- Create: `apps/maestro/src/renderer/src/components/offline-player/player-bar.tsx`
- Create: `apps/maestro/src/renderer/src/components/offline-player/queue-panel.tsx`
- Modify: `apps/maestro/src/renderer/src/routes/downloads.tsx`: replace its inline `<audio>`/order/pos state and footer with the hook and the bar.
- Modify: `apps/maestro/src/main/trpc/routers/downloads/{router,service}.ts`: `getQueue` / `saveQueue`, stored in `userData/downloads-queue.json`.
- Test: `apps/maestro/src/renderer/src/components/offline-player/restore.test.ts`

**Interfaces:**
- Consumes: Task 1 `queue.ts`; Task 2 `reportPlayer`; Task 3 `reportTrack` and `onCommand`.
- Produces:
  - `restoreQueue(saved: { q: QueueState; positionSec: number } | null, exists: (id: string) => boolean): { q: QueueState; positionSec: number } | null` (pure, in `use-offline-player.ts`)
  - `useOfflinePlayer(items: Item[])` returns `{ current, q, playing, time, play(list, startId?, shuffle?), toggle, next, prev, seek, setRepeat, toggleShuffle, playNext, addToQueue, move, removeAt, audioRef }`

- [ ] **Step 1: Write the failing test**
  `restore.test.ts`:
  - `missing item is dropped on restore`.
  - `restores position when the current item exists`; the position resets to 0 when the current item is gone.
  - `null when nothing is left`.

- [ ] **Step 2: Run it and make sure it fails**
  Run: `pnpm t:unit apps/maestro/src/renderer/src/components/offline-player`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - The hook owns the media element, applies `next(q, "ended")` on `ended`, and applies `"skip"` on Next and on a load error (today's failure counter stays).
  - When `next` returns `null` and `player.queueContinue` is on, it appends `pickAutoplay(...)`.
  - It saves `{ q, positionSec }` (throttled to 5 s) and restores it on mount.
  - A second `<audio preload="auto">` holds the next item's URL, so Next starts instantly.
  - It calls `reportPlayer` and `reportTrack` on every change and obeys `onCommand`.
  - The bar gains repeat (off/all/one) and shuffle toggles plus an "Up next" button that opens `queue-panel.tsx`. The panel lets you drag to reorder, remove, and see what's playing.
  - Track rows get "Play next" and "Add to queue".

- [ ] **Step 4: Run all unit tests and typecheck**
  Run: `pnpm t:unit && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(offline): repeat, shuffle, up next, autoplay and saved queue"`

### Task 5: Sleep timer, speed, speaker, wheel volume, shortcuts, theme

**Files:**
- Create: `apps/maestro/src/renderer/src/components/offline-player/sleep-menu.tsx`, `speed-menu.tsx`, `output-menu.tsx`, `use-shortcuts.ts`
- Modify: `apps/maestro/src/renderer/src/components/offline-player/{player-bar.tsx,use-offline-player.ts}`
- Modify: `apps/maestro/src/main/windows/windowManager.ts` (the `#030404` background in `openDownloads`)
- Test: `apps/maestro/src/renderer/src/components/offline-player/shortcuts.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 `sleep.ts`
  - `renderer-plugins/youtube/audio-output.logic.ts` (`outputMenu`, `resolveSink`, `DEFAULT_DEVICE`)
  - `SLEEP_FADE_S` from `transitions.logic.ts`
  - settings `player.keepPitch`, `player.outputDevice`
- Produces: `shortcutAction(e: { key: string; shiftKey: boolean; target: { tagName: string } }): "toggle" | "seek+5" | "seek-5" | "speed+" | "speed-" | "mute" | null`. Next and previous stay on the global shortcuts (`Shift+Alt+Right/Left`, `shared/shortcuts/catalog.ts`), which reach the offline player through Task 3.

- [ ] **Step 1: Write the failing test**
  `shortcuts.test.ts`:
  - Space and `k` → `"toggle"` (DECISIONS 2026-10-30: lowercase k is play/pause).
  - `ArrowRight` and `ArrowLeft` → `"seek+5"` and `"seek-5"`.
  - `>` and `<` → `"speed+"` and `"speed-"`.
  - `m` → `"mute"`.
  - Typing in an `INPUT` → `null`.

- [ ] **Step 2: Run it and make sure it fails**
  Run: `pnpm t:unit apps/maestro/src/renderer/src/components/offline-player`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - **Sleep menu (moon):** Off, 15/30/45/60 min, End of track, After 2/3/5 songs. It fades the element's volume over `SLEEP_FADE_S`, then pauses and restores the volume. Use `onSongBoundary` on ended, skip and prev.
  - **Speed menu:** presets 0.25–2×, `preservesPitch = player.keepPitch`. Speed is per player and not saved (spec).
  - **Output menu:** `setSinkId` on both audio elements, saves `player.outputDevice`.
  - **Wheel volume** over the volume slider, and the volume-ratio curve from `renderer-plugins/youtube/resources/volume-ratio/patch` applied to the slider when that plugin is on.
  - **Theme check:** the Downloads route uses the app theme tokens; the view background follows the theme instead of `#030404`.

- [ ] **Step 4: Run all unit tests and typecheck**
  Run: `pnpm t:unit && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat(offline): sleep timer, speed, speaker, wheel volume and shortcuts"`

### Task 6: Docs and the one real run

**Files:**
- Create: `docs/features/offline-player.md` (from `_TEMPLATE.md`)
- Modify: `docs/REUSE.md`: the reused audio-output and sleep logic, plus ideas-only notes for ytm-rs, Namida, SimpMusic and Harmony
- Modify: `IMPROVEMENTS.md`: move the phase 1 row to Done
- Modify: `docs/DECISIONS.md`: the active player; the per-player sleep timer and speed

- [ ] **Step 1: Write the docs**

- [ ] **Step 2: Do one ~1 minute app run**
  1. Download one album.
  2. Turn the network off and play it from Downloads.
  3. Set repeat to one, then shuffle, and open Up next.
  4. Set a sleep timer of "after 2 songs".
  5. Turn the network on and check the song keeps playing and the back-online bar shows.
  6. Check the tray shows the offline song and the tray's Next works.
  7. Restart the app and check the queue is restored.

  Fix what fails and rerun only that scenario.

- [ ] **Step 3: Commit**
  `git commit -m "docs(offline): offline player phase 1"`
