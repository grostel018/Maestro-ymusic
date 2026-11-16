# Bug fixes and offline downloads — design (2026-11-17)

Status: draft for owner approval. App: Maestro (`apps/maestro`), fork of ytmdesktop2, shipped as v0.0.1-beta.

## Intent

The owner shipped v0.0.1-beta and is getting the core listening experience solid before wider use. Four visible bugs hurt
daily listening (wrong music video, playback stopping, a dead Forward button, lyrics from the previous song), and the app
lacks the one big feature people expect from a desktop music app: songs that play with no internet. After those, a
sweep of about 50 smaller bugs and improvements.

Success: the owner plays a normal session and never sees a wrong video, a pause prompt, stale lyrics or a dead nav
button; they can download songs, find them as files in a folder, and play them inside Maestro with the network off.

## Goals

1. **Right video for a song.** Video mode shows the song's own official music video, or says there is none.
2. **No "video paused" stops.** Playback never halts on YouTube's idle prompt ("Video paused. Continue watching?").
3. **Back and Forward work.** Both toolbar buttons enable/disable correctly and move through YTM page history.
4. **No stale lyrics.** A song with no lyrics shows "no lyrics", never the previous song's text.
5. **Offline downloads.** Download a song (or every song of an open playlist or album) to a folder, as tagged audio
   files usable by any player, and play them inside Maestro from a Downloads page, with no internet.
6. **~50 fixes.** An area-by-area sweep; each fix small and safe.

## Non-goals

- Video downloads (audio only).
- Syncing with YouTube Music's own (Premium, mobile-only) offline library.
- Audio Lab effects (EQ, 8D, crossfade), lyrics, visualizer or scrobbling in the offline player. Plain playback, queue,
  seek, volume, shuffle/repeat only. (Owner can ask later.)
- Indexing audio files the user puts in the folder by hand.
- New perf work.

## Anti-goals (failure even if it "works")

- A download feature that silently breaks after YouTube's next change with no way to update it.
- Downloads that only play inside Maestro (opaque files), or files without title/artist/cover.
- Picking a *different song's* video because it looked similar. No video beats a wrong video.
- Any fix that adds noticeable startup time, or a test run longer than ~1 minute.

## Constraints

- Windows first (owner's platform); code stays cross-platform where it costs nothing.
- Follow repo rules in `AGENTS.md` (commit style, pnpm via corepack, lefthook hooks).
- Testing (owner rule, 2026-11-17): unit tests + typecheck while building; **one ~1-minute app run at the very end**.
  No app launches mid-work, no per-feature e2e scenarios, no perf runs.
- The YTM page is a remote site in a `WebContentsView`; it does not load offline. Anything that must work offline lives
  in Maestro's own renderer (`apps/maestro/src/renderer`) and main process.
- Downloading from YouTube is against its terms; personal-use tool. README gets one line saying so.

## Approaches considered (downloads)

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Run **yt-dlp** (+ **ffmpeg**) from the main process | Most maintained downloader; fixed within days of YouTube changes; self-updates. Costs ~100 MB of binaries. |
| B | In-app with **youtubei.js** + ffmpeg.wasm (pear-desktop's way) | No external binary, but breaks whenever YouTube tightens per-video PO tokens / SABR; fixes wait on the library. |
| C | Record the stream while it plays (MediaRecorder) | Always works, but real-time (4 min per 4-min song) and re-encoded. |

Owner said "your pick" → A, with ffmpeg (needed to embed cover art and tags reliably).

## Design

### 1. Video matching (`renderer-plugins/youtube/video-mode.*`)

Today: if YTM's queue row has no song/video pair (`playlistPanelVideoWrapperRenderer.counterpart`), Maestro searches
YTM (`/search` with the Songs/Videos filter) and picks by title ≥ 0.8, artist ≥ 0.8 and length; the pick is cached a
week (`ytmd-av-matches` in localStorage). Weak points: similar-titled other songs pass 0.8; a video may be up to 180 s
longer; a wrong pick sticks for a week; reading artist/title from a label upload's title broadens matches.

New order of sources, first hit wins:
1. Pair already in the queue (unchanged, `findTwin`).
2. **YTM's own pairing for this video id:** call the page's InnerTube client `/next` with `{ videoId, playlistId:
   "RDAMVM" + videoId }` and read the first item's `counterpart` (what ytmusicapi exposes as `counterpart` in
   `get_watch_playlist`). YouTube's ground truth; no scoring. Pure parser in `video-mode.match.ts`; the call goes
   through the same one-at-a-time finder and timeout as search.
3. **Search fallback, stricter:** title ≥ 0.92 after cleaning, main artist ≥ 0.9 (featured artists may differ),
   variant words equal (unchanged), length gap ≤ 10 s — or ≤ 90 s only when the hit is the longer video and title and
   artist are both ≥ 0.97. When both sides have an album, it must not contradict. Ties go to the higher-ranked hit.
4. Nothing → "This song has no video" (existing UI).

Cache: new storage key (`ytmd-av-matches-v2`) so old wrong picks are dropped; each entry records its source; `/next`
results kept 30 days, search hits 7 days, search misses 1 day. A **"Wrong video?"** item in the video bar menu drops
the cached match for this track and pins "no video" for it.

Tests: unit tests for the `/next` counterpart parser (fixture captured from a real response) and for the stricter
scoring (known-bad pairs as fixtures).

### 2. "Video paused" prompt (new `renderer-plugins/youtube/keep-playing.renderer.ts`)

After long idle, YouTube shows a "Video paused. Continue watching?" popup (`ytmusic-you-there-renderer`) and pauses.
New always-on renderer plugin: a MutationObserver on the popup container; when the prompt appears, click its confirm
button, and resume if the player paused because of it. Also reset the page's idle state when Maestro's own controls or
media keys are used, so the prompt rarely appears.

Same plugin, related case: when the media element fires `error` / YTM shows its player error mid-song, retry once at
the same position before giving up. Selectors live in one place; confirm them in the live page during the end run.

### 3. Back / Forward (`main/windows/webContentUtils.ts`, `main/trpc/routers/window/service.ts`)

The toolbar already has both buttons and the tRPC actions; the window-state messages only send `canGoBack`, so
Forward is always disabled. Add `canGoForward` in the three places that build `navigation` (the state helper,
`syncWindowStateToWebContents`, `syncMainWindowStates`) and its type. Also push state on `did-navigate` for the YTM
view. Add mouse back/forward buttons (`app-command` `browser-backward` / `browser-forward`) and Alt+←/→, mapped to the
same actions.

### 4. Stale lyrics (`renderer-plugins/youtube/lyrics/`)

Cause: when no provider has lyrics, the view falls back to YTM's own lyrics read from the page DOM (`ytmStockText` /
`ytmHasStockLyrics` in `lyrics/stock.ts`). YTM does not always clear that section on track change, so the previous
song's text is copied in under the new song.

Fix: fetch YTM's lyrics for the exact video id instead of reading the DOM: `/next` for the id → the Lyrics tab's
`browseId` → `/browse` → `musicDescriptionShelfRenderer` text and footer (source). Pure parser in `lyrics/`. It becomes
one more provider keyed by video id in the store, so the existing `lastVideoId` race guards cover it. DOM reading leaves
the fallback path. Also: on every `trackId:change` the view shows "loading" for the new id first (no frame of old
lyrics), and the store only ever renders an entry whose id equals the playing id. "Not found" uses the existing empty
state.

Tests: parser, and "the store never shows an entry for a different id".

### 5. Offline downloads

**Binaries (main process, new `main/services/downloader/`).** On first download, fetch `yt-dlp.exe` and an ffmpeg
build from their official GitHub releases into `userData/bin/`, each verified against the release's published SHA-256
list, with progress shown in the Downloads page. My call, with the reason: the installer stays small, and yt-dlp must
sit in a writable folder to update itself (`yt-dlp -U` in the background at most once a day). An extraction error
triggers one update and one retry.

**Running a download.** One queue in the main process, two at a time. Per song, yt-dlp is spawned with an argument
array (no shell): the `https://music.youtube.com/watch?v=<id>` URL, `-f "bestaudio[ext=m4a]/bestaudio"`,
`--no-playlist`, `--embed-metadata`, `--embed-thumbnail`, `--convert-thumbnails jpg`, `--ffmpeg-location`, a JSON
`--progress-template` with `--newline`, and an output template in the downloads folder. Cookies: the YTM session's
`.youtube.com` cookies written to a temp Netscape file for the run, deleted after, never logged, so account-only songs
and the account's best quality work. Title/artist/album/art come from Maestro's track info when it has it, so tags match
what the user saw; square album art (`hdArt`) preferred over the video thumbnail. File name `Artist - Title.m4a`,
sanitized for Windows; a video id already downloaded is skipped.

**Index.** `userData/downloads.json`: `{ videoId, title, artist, album, durationSec, file, art, addedAt }`. Opening the
Downloads page rescans and drops entries whose file is gone. Folder setting: default `Music/Maestro`, changeable in
Settings → Downloads; changing it offers to move the files.

**Starting a download (YTM page, new `renderer-plugins/youtube/downloads.renderer.ts`).**
- A download button in the player bar for the playing track (download → progress ring → done).
- "Download" in YTM's track menu (the ⋮ popup) on any song row.
- "Download all" on playlist and album pages (skips songs already downloaded).
All call a new tRPC router `downloads` (`add`, `list`, `remove`, `cancel`, progress subscription).

**Downloads page (Maestro renderer, new route `renderer/src/routes/downloads.tsx`).** In Maestro's own UI, so it works
offline. Opened from a toolbar button, a "Downloads" link added to YTM's library sidebar, and automatically when the
YTM view fails to load for lack of network (`did-fail-load` with a network error → Downloads with a "You're offline"
banner and Retry). Shows art, title, artist, length; search; Play, Shuffle, Remove (deletes the file after a confirm),
Show in folder; total size. Playback: a plain `<audio>` element; files served by a privileged custom protocol
`maestro-media://` (same pattern as `main/services/thumbnailCache.ts`). Media keys and the Windows media overlay via
`navigator.mediaSession`. Starting playback in one player pauses the other (YTM page vs offline player).

**Security.** The protocol handler resolves the path and rejects anything outside the downloads folder; video ids are
validated `^[A-Za-z0-9_-]{11}$` before reaching yt-dlp; cookies file is per-run and removed in a `finally`.

### 6. The ~50 fixes sweep

After 1–5, area by area: player bar and controls, video mode, lyrics and karaoke, queue and playlists, search,
settings, window and tray, downloads, startup and errors. Reading code for unhandled promise rejections, listeners never
removed, races on fast track changes, stale caches, missing null checks on YTM's JSON, states with no empty/error
message, keyboard and accessibility gaps, wording. Each fix small; commits grouped by area; a unit test where the logic
is pure. Each fix logged in `IMPROVEMENTS.md` (Done table) so the count is visible. Stop at ~50 or when only risky
changes remain; risky ones get listed, not done.

## Order of work

Back/Forward → stale lyrics → video matching → paused prompt → downloads → sweep → one ~1-minute app run (play a song,
toggle video, open lyrics, Back/Forward, download one song, play it from Downloads with the network off) → fix what it
shows.

## Decisions from the builder check (my calls, owner to confirm)

- **yt-dlp's JavaScript runtime.** Current yt-dlp needs an external JS runtime to solve YouTube's challenges. Use
  Maestro's own Electron binary as Node (`ELECTRON_RUN_AS_NODE=1`, passed via `--js-runtimes node:<electron exe>`), so
  there's no third download. If that fails a real download during the build, fall back to fetching Deno with the same
  checksum and self-update path. A missing runtime is a visible error, never a silent drop to worse formats.
- **Where the Downloads page lives.** In its own `WebContentsView` inside the main window, which takes the YTM view's
  place while it's open (toolbar stays). The offline `<audio>` player lives in that view; closing the page brings YTM
  back and stops the offline player. Offline fallback and Retry swap the two views the same way.
- **Other outputs during offline play.** Self-contained: only `navigator.mediaSession` (media keys, Windows overlay).
  Tray, thumbar, Discord, the API server and the toolbar track display keep following YTM only.
- **Testing "network off".** In the end run, emulate it on the YTM session (`enableNetworkEmulation({ offline: true })`
  and reload), which fails the load with a network error and so exercises the real `did-fail-load` fallback.
- **Where it ships.** Everything goes to the Maestro fork (grostel018/Maestro-ymusic) on a feature branch; nothing
  upstream.
- **"Wrong video?" undo.** The pin is per track and stored in the v2 cache. On a pinned track the same menu item reads
  "Show video again" and clears it.

## Left to the builder

Exact selectors and InnerTube response paths (confirmed against a real response, kept in one module each); Downloads
page styling (match the existing settings/toolbar look and themes); retry counts; the progress-template format; which
official ffmpeg build (smallest that embeds art).
