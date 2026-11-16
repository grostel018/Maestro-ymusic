# Bug fixes and offline downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four visible bugs (Forward button, stale lyrics, wrong video, idle pause), add offline downloads with a Downloads page, then sweep ~50 small fixes.

**Architecture:** Fixes stay in their existing modules (`main/windows`, `renderer-plugins/youtube/lyrics`, `video-mode.*`). New page-world plugins are `*.renderer.ts` files (globbed automatically). Downloads add a main-process service (`main/services/downloader/`), a tRPC router `downloads` (same `index.ts`/`router.ts`/`service.ts` shape as `routers/playlists`), a `maestro-media://` protocol, and a Maestro-owned Downloads view that swaps in for the YTM view.

**Tech Stack:** Electron, TypeScript, React (renderer), tRPC, vitest, yt-dlp + ffmpeg (fetched at runtime).

**Spec:** `docs/superpowers/specs/2026-11-17-bugfixes-and-offline-downloads-design.md`

All paths below are relative to `apps/maestro/src/` unless they start with `docs/`.

## Global Constraints

- Branch `feat/downloads-and-fixes` off `main`; push only to the Maestro fork (grostel018/Maestro-ymusic). Nothing upstream.
- Conventional Commits with a scope (`fix(lyrics): …`); `services.generated.d.ts` is committed only in Task 6 (a service is added there).
- While building: `pnpm t:unit` and `pnpm typecheck` only. **No app launches until Task 9**, which is one ~1-minute run.
- Video ids validated `^[A-Za-z0-9_-]{11}$` before any network or yt-dlp use.
- yt-dlp spawned with an argument array, never a shell; cookies file per run, deleted in `finally`, never logged.
- `maestro-media://` serves only paths inside the downloads folder.
- Default downloads folder `Music/Maestro`; file name `Artist - Title.m4a`; format `bestaudio[ext=m4a]/bestaudio`.
- Match cache key `ytmd-av-matches-v2`; TTLs: `/next` 30 days, search hit 7 days, search miss 1 day; pins never expire.

## Review Focus

1. Fast skipping (5 tracks in 3 s): lyrics, video match and download button must all end on the *last* track's state. Tested in Task 2 (store id guard) and Task 3 (finder supersede).
2. YTM JSON shape drift (missing keys, empty `counterpart`, no lyrics tab): parsers return null, never throw. Tested in Tasks 2, 3 and 7 with truncated fixtures.
3. Titles with Windows-illegal characters or reserved names (`AC/DC - Back In Black`, `CON`): sanitized file names. Tested in Task 5.
4. Path traversal on `maestro-media://` (`..%2F..%2Fwindows`): rejected. Tested in Task 6.
5. Binary download interrupted or checksum mismatch: the partial file is deleted and the next attempt starts clean. Tested in Task 5.

---

### Task 1: Back / Forward

**Files:**
- Create: `main/windows/navigationState.ts`, `main/windows/navigationState.test.ts`
- Modify: `main/windows/webContentUtils.ts` (the three `navigation` objects, ~L83, ~L109, ~L157), `main/trpc/routers/window/service.ts` (push state on `did-navigate`), the window-state navigation type (`grep -rn "canGoBack" shared main`), and where the YTM view is created (`main/windows/view.ts`)

**Interfaces:**
- Produces: `navigationState(history: Pick<Electron.NavigationHistory, "canGoBack" | "canGoForward" | "getActiveIndex">): { canGoBack: boolean; canGoForward: boolean; index: number }`; all three call sites use it.

- [ ] **Step 1:** Test: a fake history (back true, forward true, index 2) → `{ canGoBack: true, canGoForward: true, index: 2 }`; forward false → `canGoForward: false`.
- [ ] **Step 2:** `pnpm t:unit navigationState` → FAIL (module missing).
- [ ] **Step 3:** Implement; replace the three inline objects; add `canGoForward: boolean` to the type. On the YTM view's `webContents`: `app-command` `browser-backward`/`browser-forward`, and `before-input-event` Alt+ArrowLeft/ArrowRight, call `navigationHistory.goBack()`/`goForward()` when allowed.
- [ ] **Step 4:** `pnpm t:unit navigationState && pnpm typecheck` → PASS.
- [ ] **Step 5:** `git checkout -b feat/downloads-and-fixes`; commit the spec + plan as `docs(plan): bug fixes and offline downloads`, then this as `fix(window): enable Forward and add mouse and Alt+arrow navigation`.

### Task 2: Stale lyrics — YTM lyrics by video id

**Files:**
- Create: `renderer-plugins/youtube/lyrics/ytm-lyrics.ts`, `renderer-plugins/youtube/lyrics/ytm-lyrics.test.ts`; fixtures `renderer-plugins/youtube/fixtures/{next-with-lyrics,next-no-lyrics,browse-lyrics}.json`
- Modify: `renderer-plugins/youtube/lyrics/store.ts` (stock path ~L30-60, `applyCacheIfPresent`), `renderer-plugins/youtube/lyrics.plugin.ts` (`refreshTrack`), `renderer-plugins/youtube/lyrics/stock.ts` (drop DOM text reading from the fallback)

**Interfaces:**
- Consumes: `SearchFetch` from `video-mode.search.ts`.
- Produces: `lyricsBrowseId(next: unknown): string | null`, `parseYtmLyrics(browse: unknown): { text: string; source: string } | null`, `fetchYtmLyrics(videoId: string, fetch: SearchFetch): Promise<{ text: string; source: string } | null>`. The store's result keeps today's shape: `provider: "youtube-music"`, `syncLevel: "plain"`.

- [ ] **Step 1:** Tests:
  - `lyricsBrowseId(nextWithLyrics)` equals the fixture's `MPLY…` id.
  - `lyricsBrowseId(nextNoLyrics)` and `lyricsBrowseId({})` are null.
  - `parseYtmLyrics(browseLyrics)` returns the text without the footer, and `source` without "Source: ".
  - `parseYtmLyrics({ contents: {} })` is null.
  - Store: with an entry cached for `aaaaaaaaaaa` while `bbbbbbbbbbb` plays, `applyCacheIfPresent("bbbbbbbbbbb")` is false and the snapshot is never `ready` for `aaaaaaaaaaa`.
- [ ] **Step 2:** `pnpm t:unit lyrics` → FAIL.
- [ ] **Step 3:** Implement:
  - Fixtures: capture once from a real `/next` + `/browse` through the page's `networkManager.fetch` (as `video-mode.renderer.ts` does), trimmed to the needed paths.
  - Store: replace `ytmStockText()` with `fetchYtmLyrics(videoId)`, keyed by id and applied only when `videoId === runtime.lastVideoId`.
  - `refreshTrack`: set loading for the new id before any await.
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `fix(lyrics): fetch YouTube Music lyrics for the playing song, never the previous one`.

### Task 3: Video matching — YTM's own pairing first, stricter search

**Files:**
- Modify: `renderer-plugins/youtube/video-mode.match.ts`, `video-mode.search.ts`, `video-mode.renderer.ts`, `video-controls.menu.ts` (Wrong video item)
- Test: `video-mode.match.test.ts`, `video-mode.search.test.ts`; fixture `fixtures/next-counterpart.json`

**Interfaces:**
- Produces: `parseNextCounterpart(next: unknown, videoId: string): VersionMatch | null` in `video-mode.match.ts`.
- `MatchCache.set(key, match, source: "next" | "search")`: entries become `[at, match, source]`, `STORAGE_KEY = "ytmd-av-matches-v2"`, and TTL depends on source and hit/miss (see Global Constraints). Also `MatchCache.pin(videoId, want)`, `unpin(videoId, want)` and `isPinned(videoId, want)`; a pinned track reads as `null` and never expires.
- `createVersionFinder` tries `/next` (`{ videoId, playlistId: "RDAMVM" + videoId }`) before `/search`, inside the same timeout and one-at-a-time queue.
- Constants: `MIN_TITLE = 0.92`, `MIN_ARTIST = 0.9`, `MAX_VIDEO_EXTRA_SEC = 90`, `STRONG = 0.97`.

- [ ] **Step 1:** Tests:
  - `parseNextCounterpart(fixture, id)` returns the counterpart's id and type, and null for a response without `counterpart` and for `{}`.
  - `pickMatch` rejects "Love Me" vs "Love Me Now" (same artist), the same title by a different main artist, a video 120 s longer, and an album contradiction.
  - `pickMatch` accepts the same title and artist with a video 60 s longer, both scores ≥ 0.97.
  - Finder: a `/next` hit means `/search` is never called. A request superseded by a newer one resolves null, and the newer one's result is cached.
  - Cache: a pinned key still returns null after 31 days; v1 storage is ignored.
- [ ] **Step 2:** `pnpm t:unit video-mode` → FAIL.
- [ ] **Step 3:** Implement. Main artist is the first artist after `cleanArtist`, split on `,`, `&` or `feat.`. In the renderer, "Wrong video?" in the video bar menu calls `pin`, drops the pair and re-applies. On a pinned track the item reads "Show video again" and calls `unpin`.
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `fix(video): use YouTube Music's own song/video pairing and stricter matching`.

### Task 4: Keep playing through the idle prompt

**Files:**
- Create: `renderer-plugins/youtube/keep-playing.renderer.ts`, `keep-playing.logic.ts`, `keep-playing.logic.test.ts`

**Interfaces:**
- Produces: `KEEP_PLAYING_SELECTORS = { popup: "ytmusic-popup-container", prompt: "ytmusic-you-there-renderer", confirm: "ytmusic-you-there-renderer button, ytmusic-you-there-renderer yt-button-renderer" }`, and `shouldRetry(state: { errors: number; lastErrorAt: number; now: number }): boolean` (true on the first error, then not again within 60 s for the same track).

- [ ] **Step 1:** Tests for `shouldRetry`: first error true; a second within 60 s false; after 60 s true.
- [ ] **Step 2:** `pnpm t:unit keep-playing` → FAIL.
- [ ] **Step 3:** Implement the logic, then the renderer:
  - A MutationObserver on the popup container, falling back to `document.body`.
  - When the prompt appears, click confirm, and call `playVideo()` if playback paused within 2 s of the prompt.
  - A media `error` mid-song → `shouldRetry` → `loadVideoById(id, currentTime)` once.
  - On Maestro control or media-key use, dispatch a `mousemove` on `document` so YTM's idle timer resets.
  - Debug-log each action.
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `fix(player): dismiss the "Continue watching?" prompt and retry a failed stream once`.

### Task 5: Downloader core (main process)

**Files:**
- Create: `main/services/downloader/{binaries,run,names,index-store,cookies}.ts`, with a `*.test.ts` for `names`, `binaries`, `run` (argument builder) and `index-store`

**Interfaces:**
- `ensureBinaries(dir: string, opts: { fetch: typeof fetch; onProgress?(p: { name: "yt-dlp" | "ffmpeg"; percent: number }): void }): Promise<{ ytDlp: string; ffmpeg: string }>`: official release assets checked against their SHA-256 list. On a mismatch or interruption it deletes the partial file and throws `BinaryError`.
- `updateYtDlp(ytDlp: string, stampFile: string): Promise<void>`: runs `-U` at most once per 24 h.
- `safeFileName(artist: string, title: string, ext: string): string`:
  - strips `<>:"/\|?*` and control characters
  - trims trailing dots and spaces
  - prefixes `_` on reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`)
  - caps the name at 180 characters
- `DownloadJob = { videoId: string; title: string; artist: string; album?: string; artUrl?: string; durationSec?: number }`.
- `buildArgs(job: DownloadJob, paths: { ffmpeg: string; electron: string; cookies: string | null; outDir: string }): string[]`: the spec's flags, plus `--js-runtimes node:<electron>` and `--parse-metadata`/`--replace-in-metadata` for title, artist and album. Throws on an invalid id.
- `runDownload(job: DownloadJob, paths, onProgress: (percent: number) => void, signal: AbortSignal): Promise<{ file: string }>`: spawns with env `ELECTRON_RUN_AS_NODE=1` for the runtime. On an extraction error it calls `updateYtDlp` once and retries.
- `writeCookies(session: Electron.Session, dir: string): Promise<string>`: writes the Netscape format for `.youtube.com`. The caller deletes the file in `finally`.
- `DownloadEntry = { videoId: string; title: string; artist: string; album?: string; durationSec?: number; file: string; art?: string; addedAt: number }`.
- `createIndex(file: string): { list(): DownloadEntry[]; add(e: DownloadEntry): void; remove(videoId: string): void; prune(exists: (p: string) => boolean): void; has(videoId: string): boolean }`.

- [ ] **Step 1:** Tests:
  - `safeFileName("AC/DC", "Back In Black", "m4a")` → `"AC_DC - Back In Black.m4a"`.
  - `safeFileName("CON", "x", "m4a")` starts with `_`.
  - `buildArgs` contains `--no-playlist` and `bestaudio[ext=m4a]/bestaudio`, includes the cookies path only when one is given, and throws for id `../../x`.
  - `ensureBinaries`, with a fake fetch whose bytes don't match the checksum, throws and leaves no file in `dir`.
  - Index: add, has, remove and prune, using a fake `exists`.
- [ ] **Step 2:** `pnpm t:unit downloader` → FAIL.
- [ ] **Step 3:** Implement. Asset names come from the latest releases at build time: yt-dlp's `yt-dlp.exe` + `SHA2-256SUMS`, and ffmpeg from yt-dlp's FFmpeg-Builds release (the smallest win64 zip, with its checksums).
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(downloads): add the yt-dlp downloader core`.

### Task 6: Downloads router, queue and media protocol

**Files:**
- Create: `main/trpc/routers/downloads/{index,router,service}.ts`, `main/services/mediaProtocol.ts`, `main/services/mediaProtocol.test.ts`
- Modify: `main/main.ts` (~L52 `registerSchemesAsPrivileged`: add `maestro-media`), the settings service (add `downloads.folder`, default `join(app.getPath("music"), "Maestro")`), and regenerate `services.generated.d.ts`

**Interfaces:**
- Consumes: Task 5's functions and types.
- Router `downloads`:
  - `add({ jobs: DownloadJob[] })`
  - `list() → DownloadEntry[]` (prunes first)
  - `remove({ videoId })` (deletes the file and its art)
  - `cancel({ videoId })`
  - `openFolder()`
  - `moveFolder({ to })`
  - `status` subscription → `{ videoId: string; state: "queued" | "binaries" | "downloading" | "done" | "error"; percent: number; error?: string }`
- Queue: 2 jobs at a time; a duplicate id is a no-op; ids already in the index are skipped.
- `resolveMediaPath(url: string, root: string): string | null`: decodes and resolves the path, and returns null unless it's inside `root`. URL form: `maestro-media://file/<encodeURIComponent(relative path)>`.

- [ ] **Step 1:** Tests: `resolveMediaPath("maestro-media://file/a.m4a", root)` → `root/a.m4a`; `..%2F..%2Fwindows%2Fwin.ini` → null; `C%3A%5CWindows` → null.
- [ ] **Step 2:** `pnpm t:unit mediaProtocol` → FAIL.
- [ ] **Step 3:** Implement the router and service on Task 5, and register the protocol following `main/services/thumbnailCache.ts`. On app start, if the binaries exist, call `updateYtDlp` in the background.
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(downloads): add the download queue, router and media protocol`.

### Task 7: Download buttons in YTM and the Downloads page

**Files:**
- Create: `renderer-plugins/youtube/downloads.renderer.ts`, `downloads.logic.ts`, `downloads.logic.test.ts`; `renderer/src/routes/downloads.tsx`, `renderer/src/components/offline-player.tsx`
- Modify:
  - `main/windows/view.ts` / layout: a `downloadsView` that takes the YTM view's bounds while it's open
  - `main/trpc/routers/navigation`: `openDownloads({ offline?: boolean })`, `closeDownloads()`
  - `renderer/src/routes/youtube/toolbar.tsx`: a Downloads button
  - the YTM view's `did-fail-load` handler

**Interfaces:**
- Consumes: the `downloads` router (Task 6).
- `jobFromRow(row: unknown): DownloadJob | null` reads a `musicResponsiveListItemRenderer` or a `playlistPanelVideoRenderer`. `jobsFromPage(state: unknown): DownloadJob[]` reads the rows of a playlist or album page.
- Offline fallback:
  - Trigger: a main-frame `did-fail-load` whose `errorCode` is in `[-106, -105, -109, -21, -2]` → `openDownloads({ offline: true })`.
  - Retry: reload YTM, then `closeDownloads()` on `did-finish-load`.

- [ ] **Step 1:** Tests: `jobFromRow` on fixture rows yields the id, title, artist and album, and returns null for a podcast-episode row and for `{}`. `jobsFromPage` skips rows without an id.
- [ ] **Step 2:** `pnpm t:unit downloads.logic` → FAIL.
- [ ] **Step 3:** Implement:
  - The player-bar button (download → progress ring → done) and "Download" in the ⋮ menu popup.
  - "Download all" on playlist and album headers, and a "Downloads" entry in the library sidebar.
  - The page: list, search, Play, Shuffle, Remove with a confirm, Show in folder, total size, and an offline banner with Retry.
  - The `<audio>` player with `navigator.mediaSession`. YTM is paused while it plays, and it pauses when YTM plays.
  - Styling from the existing settings components and theme tokens.
  - Settings → Downloads (`renderer/src/routes/_settings/`): folder picker; changing it asks whether to move the files (`moveFolder`).
- [ ] **Step 4:** `pnpm t:unit && pnpm typecheck` → PASS.
- [ ] **Step 5:** Add one README line on personal use and YouTube's terms. Commit `feat(downloads): add download buttons and the offline Downloads page`.

### Task 8: The ~50 fixes sweep

**Files:** as found. Each fix gets the next free ID in `IMPROVEMENTS.md` (repo root) and goes in its Done table.

- [ ] **Step 1:** Go area by area, in this order: player bar and controls, video mode, lyrics and karaoke, queue and playlists, search, settings, window and tray, downloads, startup and errors. Look for:
  - unhandled rejections
  - listeners that are never removed
  - races on fast track changes
  - stale caches
  - unchecked YTM JSON
  - missing empty or error states
  - keyboard and accessibility gaps
  - wording
- [ ] **Step 2:** Each fix stays small. Add a unit test where the logic is pure, and commit by area (`fix(<area>): …`).
- [ ] **Step 3:** After each area, run `pnpm t:unit && pnpm typecheck` → PASS. Stop at ~50 fixes, or when only risky ones are left; list the risky ones as `todo`.

### Task 9: The one ~1-minute run, then the review

- [ ] **Step 1:** Build if changed (`node scripts/build-if-changed.mjs`) and launch once with CDP. In about 60 s, using real input only (CDP mouse and key events):
  - play a song and toggle Video
  - open Lyrics on a song with no lyrics
  - go Back, then Forward
  - download one song
  - set `enableNetworkEmulation({ offline: true })` on the YTM session and reload, then check that Downloads opens and plays the file
- [ ] **Step 2:** Fix what failed and rerun only that check.
- [ ] **Step 3:** Get one whole-branch review from a fresh reviewer on the most capable model, and fix what it confirms. Push the branch to the fork and open a PR to the fork's `main`.
