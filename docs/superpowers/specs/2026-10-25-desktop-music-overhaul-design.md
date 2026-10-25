# YTMDesktop2 Desktop Music Overhaul — Design

Date: 2026-10-25
Branch: `feature/desktop-overhaul`
Status: draft for review

## 1. Intent

The owner wants a Windows music player that feels like Apple Music, has the feature depth of
Metrolist (Android), and runs on their own YouTube Music account and playlists. It must be smooth,
free of ads without a Premium subscription, and open to personal taste: themes, video or audio-only
playback, phone-style synced lyrics.

ytmdesktop2 is the base because it already solves the hard parts: signing in to Google, playing
YouTube Music through the real web player, media keys (xosms), Discord, Last.fm, Chromecast, a
plugin system that runs code inside the YouTube page, four lyrics providers with word-level
timing, an SCSS theme system and a React app for the app's own chrome (toolbar, settings, tray
view).

The installed build (v0.18.9) felt slow: the whole window lagged, worst in fullscreen. Fixing that
comes before any new feature, and every new feature has to prove it doesn't bring the lag back.

That build is 207 commits and an Electron major behind `master` (Electron 36, Vue renderer,
different Chromium flags). So the phase 1 performance items below are suspects found by reading
the current code, not confirmed causes. The bench measures current `master` first. A fix stays
only if it measurably helps or fixes a correctness bug.

"Fullscreen" is measured in two states:
- the maximized window,
- YouTube Music's own fullscreen button (HTML fullscreen).

The current code never uses OS fullscreen (`setFullScreen`).

## 2. Goals, non-goals, anti-goals

### Goals

1. **Smooth.** No whole-window lag on resize, maximize or fullscreen. Measured, not eyeballed
   (section 8).
2. **No ads**, signed in or not, without Premium. This covers audio and video ads, banner and
   upsell pop-ups, and the "ad blockers are not allowed" interruption.
3. **A real video player** with YouTube's controls: resolution (up to whatever the stream has),
   speed, captions, loop, picture-in-picture, theater/fill, true fullscreen and YouTube's keyboard
   shortcuts.
4. **Themes that the owner controls**: light, dark, black (AMOLED) and dynamic (colors taken from
   the current artwork), preset palettes, a custom accent color, and import/export, applied to
   both the YouTube page and the app chrome.
5. **An Apple Music–style Now Playing screen** with phone-style lyrics: large lines, word-by-word
   fill, smooth spring scrolling, tap a line to seek, duet and background-vocal layout,
   instrumental-break dots, and translation/romanization lines (the owner listens to a lot of
   Japanese music).
6. **Metrolist parity** where it makes sense on desktop (section 5).
7. **A test bench like the owner's idm-clone project**: launch the real app with a throwaway
   profile, drive it over the Chrome DevTools Protocol, run numbered scenarios, and generate
   `VERIFICATION.md` and a weighted `IMPROVEMENTS.md` backlog.

### Non-goals (for now)

- **A native YouTube data client** (Metrolist's InnerTube + cipher + PoToken approach). On desktop
  the web player already does this and Google maintains it. Writing our own client means chasing
  YouTube's cipher changes forever. We revisit only if a later phase needs data the web page
  can't give.
- **Listen Together.** It needs a hosted server (Metrolist uses metroserver).
- **Music recognition** (Shazam-style).
- **macOS/Linux polish.** Nothing should break on them, but Windows is the target and the only
  platform tested.

### Anti-goals (failure even if it "works")

- **Anything that interrupts playback.** An ad blocker or audio effect that makes songs stall,
  skip or go silent is worse than the ads.
- **New UI that costs more frames than what it replaces.** Every phase must pass the performance
  scenarios.
- **Core features locked behind sign-in or Premium.**
- **Features that can't be turned off.** Every feature is a plugin or has a setting, so the
  owner can switch off anything that misbehaves without a rebuild.
- **Breaking the owner's existing settings and profile.** Settings migrations are required for
  any change to a settings key.

## 3. Constraints

- Electron 43, React 19, TanStack Router, tRPC over IPC, Tailwind/shadcn, `motion`, `node-vibrant`
  (already in deps). pnpm 11.15.1, Node ≥ 24.14.
- **The YouTube page is the engine.** Playback, auth and data come from `music.youtube.com`
  running in `youtubeView` (a `WebContentsView`). Our features either:
  - run inside that page as plugins (`src/renderer-plugins/youtube/*.plugin.ts`, page-world code
    in `*.renderer.ts`), or
  - render in our own React views (`src/renderer`, served as `WebContentsView`s or windows).
- **Upstream contribution conventions** (no CONTRIBUTING.md; implicit): Conventional Commits with
  scope (`feat(video-controls): …`), Biome formatting via the lefthook pre-commit hook, `pnpm test`
  must pass, PRs target `master`. `master` stays a clean copy of upstream. All work happens on
  `feature/*` branches. Each feature lands as its own commits so the upstream-friendly parts can
  become separate PRs. The ad blocker and downloads are probably fork-only, since that's the
  maintainer's call.
- **Generated files** (`services.generated.d.ts`, `resources/embeds/now-playing/`) change on
  every build. Commit them only when a change actually requires it.
- **Branching.** All work stacks on `feature/desktop-overhaul`. Pieces worth offering upstream
  (the bench, layout fixes, video controls) are cherry-picked later onto their own branches cut
  from `master`.
- **The maintainer's existing flags were chosen on purpose.** Comments in `startup/service.ts`
  mention a large-playlist hang and EcoQoS throttling. They are changed only with a bench
  measurement showing a gain, and with p7 (playback while minimized) still passing.
- **The fork runs alongside the installed app.** It does not replace it. It gets:
  - its own appId, product name and `userData` folder, and therefore its own single-instance lock
    and a fresh profile,
  - the upstream auto-updater disabled, so the fork is never "updated" back to upstream.

  The owner's v0.18.9 profile is never touched.

## 4. Architecture decision: "YouTube engine, our shell"

Three shapes were considered:

| Option | What it is | Verdict |
|---|---|---|
| A. Skin only | Keep YTM's UI, restyle with CSS | Cheap, but can't deliver Apple-style Now Playing, lyrics or a real video player |
| B. Native client | Own UI + own InnerTube client, YTM page not used | Maximum control. Metrolist-level maintenance (cipher, PoToken), large rewrite. Rejected for now |
| **C. Hybrid** | YTM page stays the engine and handles browse/library/search, restyled by the theme engine. Signature experiences (Now Playing, lyrics, video controls, mini player, settings) are our own UI | **Chosen** |

How C splits the work:

- **Inside the YouTube page (plugins):** ad blocking (response pruning plus fallback skipping),
  video controls overlay, audio graph (EQ, normalization, fades, skip silence), theme CSS
  variables, Premium-upsell hiding.
- **Main process:** network-level ad blocking, window and view layout, the settings store, the
  relay between page and views.
- **Our React views:** toolbar (redesigned in phase 3), Now Playing, mini player (existing
  `trayView`), settings.

## 5. Metrolist parity map

| Metrolist feature | Desktop status | Phase |
|---|---|---|
| Stream songs and videos, background playback | Have (YTM) | — |
| Search, quick picks, library, account sync | Have (YTM) | — |
| Reorder queue/playlist | Have (YTM). Better queue panel in Now Playing | 4 |
| Live synced lyrics (Better Lyrics, word sync) | Have (4 providers). New Apple-style renderer | 4 |
| Lyrics translation | New: translation + romanization lines | 6 |
| Light / Dark / Black / Dynamic + palettes | New theme engine | 3 |
| Equalizer | New (Web Audio, 10-band + presets) | 5 |
| Audio normalization | New (YouTube loudness metadata → gain) | 5 |
| Tempo and pitch | Speed in video controls (2). Pitch toggle and pitch-shift in audio lab (5) | 2, 5 |
| Crossfade | New: fade-out/fade-in between tracks. True overlap is a stretch goal | 5 |
| Skip silence | New (silence detector) | 5 |
| Sleep timer | New | 5 |
| Download / offline cache | New, optional (yt-dlp), local library | 6 |
| Local playlists, playlist import | New | 6 |
| Last.fm, Discord RPC, Cast | Have | — |
| Home-screen widget | Desktop equivalents: mini player, taskbar thumbnail buttons, media keys | 4 |
| Listen Together, music recognition | Non-goal | — |

## 6. Roadmap

Each phase ships on its own, is a separate implementation plan, and must keep the e2e and perf
scenarios green.

### Phase 0 — Test bench

Same shape as idm-clone:

- **Runner.** `apps/ytmdesktop2/tests/e2e/run.ts`, run by plain Node 24 (built-in type stripping
  and `WebSocket`, no new deps). Usage: `pnpm test:e2e [s3 s7 …]`.
- **Real app, isolated.** It launches the production build (`out/`, built by
  `electron-vite build`) with:
  - its own `--user-data-dir` in a temp folder, seeded with an `app-settings.yml` that turns off
    autostart, auto-update and telemetry,
  - `--remote-debugging-port` (CDP for every view),
  - `--inspect` (to evaluate code in the main process).
  The production build is used because dev mode opens three detached DevTools windows and would
  skew timing.
- **Profile.** The production build already honors `--user-data-dir`, so no app change is needed
  (the dev-only `userData` override in `electron.ts` doesn't apply).
- **Network.** Scenarios use the real `music.youtube.com`, signed out by default. Signed-out
  playback works and still gets ads, which is exactly what the ad-block scenarios need.
- **Accounts.** Signed-in scenarios use a throwaway Google account, never the owner's real one,
  because repeated ad-block runs could trigger YouTube's enforcement on that account.
  - `pnpm test:e2e --login` opens the app on a bench-owned profile
    (`%LOCALAPPDATA%\ytmd-e2e\signed-in`) so the owner can sign in once by hand.
  - `E2E_PROFILE=signed-in` copies that profile into each run's temp folder.
  - Profiles from packaged builds can't be reused: they are cookie-encrypted by the
    `EnableCookieEncryption` fuse, and the bench runs the unfused Electron from `node_modules`.
- **Scenarios** are numbered `sNN`. Each prints `PASS sNN` / `FAIL sNN`. A failed run keeps its
  temp folder (plus screenshots) for inspection, and `E2E_KEEP=1` keeps it always.
- **Perf scenarios** are `pNN`, run with `pnpm test:perf`, and write
  `tests/e2e/results/perf-<timestamp>.json`.
- **Generated reports.** `pnpm verify` regenerates `VERIFICATION.md` from the last suite log. Each
  checklist row is tied to the scenario that proves it. `IMPROVEMENTS.md` is the weighted backlog
  with the same rules as idm-clone (weight 0–100, tiers, IDs never change, Done table). It is
  seeded from this roadmap.
- **CDP diagnostics.** The bench logs which GPU Chromium is using (`SystemInfo.getInfo`). Hybrid
  laptops often run Electron on the integrated GPU, and that alone can explain a slow fullscreen.

### Phase 1 — Smooth and ad-free

**Performance fixes.** Each one is measured before and after.

1. **One layout path.** `WindowManager` handles `resize`, `maximize`, `unmaximize`,
   `enter/leave-full-screen` and `enter/leave-html-full-screen` without delay. That means
   removing the 100ms debounce and using `lockSizeToParent` on `will-resize` (which reads the old
   size) for the main window's views. In HTML fullscreen (video) the toolbar hides and the
   YouTube view fills the screen. Today `disableHtmlFullscreenWindowResize` plus a stale bounds
   offset leaves the toolbar strip on screen.
2. **Cheap glass.** The `themes.blur` layer (`chrome/blur.scss`) puts `backdrop-filter: blur(20px)`
   over the whole player page and `filter: blur(16px)` on the artwork background. It defaults to
   on for new profiles, and the fork starts with a new profile. An old migration switched it off
   for upgraded profiles. Both blur rules are replaced. The new background is a
   pre-blurred, low-resolution copy of the artwork, scaled up and treated as a static layer. That
   costs one static image instead of re-blurring the whole screen on every frame. "Glass (expensive)"
   stays as an opt-in theme option.
3. **Opaque toolbar.** The toolbar `WebContentsView` drops `transparent: true` and paints the
   theme background.
4. **Let Chromium rest.**
   - The occlusion and backgrounding switches (`CalculateNativeWinOcclusion`,
     `disable-backgrounding-occluded-windows`, `disable-renderer-backgrounding`,
     `disable-background-timer-throttling`) are process-wide. Occlusion also covers the whole
     window, so they can't be scoped to some views. They are removed only if p6 improves while
     p7 still passes; otherwise they stay as the maintainer set them.
   - The per-view control that does exist is `backgroundThrottling`. It turns back on for the
     app-chrome views (toolbar, loading, settings, tray) and stays off for the YouTube view.
     Chromium also never throttles a page that's playing audio.
   - Hold the `prevent-app-suspension` power blocker only while music is playing.
5. **GPU flags.**
   - `ignore-gpu-blocklist` moves behind an advanced setting ("Force GPU on unsupported drivers",
     off).
   - Remove the misspelled no-op `in-progress-gpu` switch.
   - Keep `enable-gpu-rasterization`.
6. **Dev ergonomics.** DevTools auto-open only when `YTMD_DEVTOOLS=1`, so dev mode feels like the
   real app.
7. **Fork identity** (needed before the owner installs a build to test):
   - appId `com.ytmdesktop2.plus`, product name "YTMDesktop2 Plus", `userData` folder
     `ytmdesktop2-plus`,
   - the upstream update feed and the update check are turned off.

**Ad block.** This is a new plugin, `adblock`, on by default, with three layers. Each layer can
be turned off separately under Settings → Player → Ad block (advanced).

1. **Network.** `@ghostery/adblocker-electron` on the YouTube view's session, with the prebuilt
   ads + tracking lists. The compiled engine is cached in `userData` and refreshed weekly. It
   blocks ad servers, pings and trackers.
2. **Response pruning** (page world, before YouTube's scripts run):
   - Wrap `fetch`/XHR and the `ytInitialPlayerResponse` / `ytInitialData` setters.
   - Delete `adPlacements`, `playerAds`, `adSlots` and `adBreakHeartbeatParams` from `/youtubei/v1/player`
     and `/next` responses.
   - Drop the anti-adblock enforcement messages.

   This is the layer that actually stops YouTube's own ads, which come from the same servers as
   the music.
3. **Fallback.** If the player still enters `ad-showing`, mute it, play the ad at 16× speed,
   press Skip as soon as it appears, then restore volume and speed. Each event is counted.

Also: hide Premium upsell banners, mealbars and dialogs (cosmetic CSS, separate toggle). Settings
shows "ads blocked this session / total".

### Phase 2 — Video player

A new page-world plugin, `video-controls`, renders our own control layer over YTM's player
element when the Song/Video toggle is on Video. It uses YouTube's player API on `#movie_player`
(`getAvailableQualityLevels`, `setPlaybackQualityRange`, `setPlaybackRate`, caption options,
`getVideoStats`).

- **Settings menu:**
  - Quality: Auto plus every available level, with the existing `player.res` preference as
    default.
  - Speed: 0.25–2× plus a custom value.
  - Captions: on/off, language and auto-translate.
  - Loop.
  - Stats ("stats for nerds lite": resolution, codec, dropped frames, buffer).
- **Buttons:** picture-in-picture, theater (fill the app window), and fullscreen (fills the
  monitor using phase 1's HTML-fullscreen path).
- **YouTube's keyboard shortcuts** while the player is focused: `k`/space, `j`/`l` ±10 s,
  ←/→ ±5 s, `,`/`.` frame step when paused, `<`/`>` speed, `f`, `m`, `c`, `0–9` seek percent,
  `i` PiP, `t` theater.
- **Setting:** "Open new tracks as video when available" (off).
- **Speed with audio:** speed also applies in audio mode. A toggle "keep pitch" maps to
  `preservesPitch`.

### Phase 3 — Theme engine

- **Theme document** (JSON): mode (`light` | `dark` | `black` | `dynamic`), palette (accent,
  surface, on-surface, muted), font (Inter, Geist, or system), corner radius, background style
  (`solid` | `artwork-gradient` | `artwork-blur-cheap` | `glass-expensive`), and density.
- **Compiled to CSS variables**, injected into the YouTube page (through the existing themes
  compiler/injector) and into the React views (Tailwind tokens), so the page and the chrome
  always match.
- **Dynamic mode** picks colors from the current artwork with `node-vibrant` (already a
  dependency) on track change, with a 400ms cross-fade of the variables.
- **Presets:**
  - "Apple Music" (light and dark),
  - "AMOLED Black",
  - "YouTube" (close to stock),
  - about 16 palettes in the spirit of Metrolist's 19.
- **Settings → Appearance → Themes:** palette grid, live preview, accent color picker, import and
  export (`.ytmdtheme.json`), duplicate-and-edit. Custom SCSS files (the existing `customFile`
  feature) still work and apply on top.
- **Toolbar redesign** in Apple Music for Windows style: back/forward and search on the left; a
  centered "LCD" now-playing pill (artwork, title, artist, scrubber); window controls on the
  right. YTM's bottom player bar stays visible and gets restyled. Hiding it is a later
  experiment, not part of this phase.

### Phase 4 — Now Playing and Apple-style lyrics

- **New route `/youtube/now-playing`** in the React app, shown as a full-window `WebContentsView`
  over the YouTube view.
  - Opened by clicking the artwork, the toolbar LCD, or pressing F11 (F11 opens it in
    fullscreen).
  - It replaces YTM's player page as the "big" experience. The YouTube page keeps playing
    underneath and is hidden (its view is detached, so it stops painting but audio continues).
- **Layout:** large artwork with a soft shadow that scales down slightly on pause, title/artist,
  scrubber, transport controls, volume, and toggles for lyrics, queue and video. Lyrics or queue
  sit on the right.
- **Background:** an animated mesh gradient from the artwork's colors. It is a WebGL shader
  rendered at quarter resolution and scaled up, paused when the view is hidden, and replaced by a
  static gradient when "reduce motion" is on.
- **Lyrics renderer**, a new component that reuses the existing parsed lyric data (LRC, TTML,
  Better Lyrics):
  - Bold 32–44px lines. The active line is at full opacity and the others are dimmed.
  - Word-by-word fill with a soft glow when word timing exists, line-level otherwise.
  - Spring scrolling with `motion`.
  - Tap a line to seek.
  - Background vocals smaller under their line; duet singers aligned left and right.
  - Three pulsing dots for instrumental breaks.
  - Optional translation/romanization line (data arrives in phase 6; the slot exists now).
- **Lyrics data path.** Providers and matching stay in the page world (they work today). A small
  relay publishes the resolved lyric document and playback position from the page to main, and
  then to the Now Playing view. Position updates go at about 30 Hz while the view is visible and
  stop when it's hidden.
- **Queue panel:** the current queue from the existing `navigation` service (`queueList`,
  `queuePlay`, `queueClear`, `onQueue`). Drag reorder, remove and "play next" are new page
  commands written against YTM's queue store.
- **Video toggle in Now Playing:** it closes Now Playing, switches YTM to Video, and shows YTM's
  player page with the phase 2 controls. Now Playing only *detaches* the YouTube view (audio
  continues, painting stops); it never shows video itself.
- **Mini player:** polish the existing `trayView` into an always-on-top compact player with an
  artwork background. Windows taskbar thumbnail buttons already exist (`winControl` service).

### Phase 5 — Audio lab

A page-world Web Audio graph on YTM's media element: `MediaElementSource → normalization gain →
10-band EQ → fade gain → destination`. It is created lazily on first use and bypassed entirely
when every feature is off, so there's no cost.

- **Equalizer:**
  - 10 bands (32 Hz–16 kHz) with presets: Flat, Bass Boost, Vocal, Treble, Loudness, Acoustic,
    Electronic.
  - Custom presets are saved.
  - Pre-amp control.
- **Normalization** using the loudness value YouTube sends with each track, targeting −14 LUFS.
  Merge with or replace the existing `volumeRatio` plugin; the builder decides which after
  reading it.
- **Smooth transitions:** fade out the last N seconds (1–12, default 5) and fade in the next
  track. True overlapping crossfade needs a second player and is a stretch goal.
- **Skip silence:** an analyser detects more than 1.5 s below −50 dB in the middle of a track,
  or a silent tail, and jumps past it.
- **Pitch:** a "keep pitch" toggle. Independent pitch shift (±6 semitones) uses a SoundTouch
  AudioWorklet; it is optional and goes last in the phase.
- **Sleep timer:** after N minutes or at the end of the current track, fade out over 10 s, then
  pause.

### Phase 6 — Library and extras

- **Lyrics translation and romanization:**
  - Japanese, Korean and Chinese romanization runs locally where a small library exists. A large
    dictionary is downloaded on first use rather than bundled.
  - Translation uses a pluggable provider; the default is a free endpoint, with a setting to add
    an API key.
- **Local playlists** stored in `userData`, with import from YTM playlists, CSV, M3U and a
  Spotify export file, and playback through YTM by video ID.
- **Optional offline downloads** through a user-provided or auto-downloaded `yt-dlp`. The idm-clone
  project already wraps yt-dlp, so its approach is a reference. Downloaded tracks get a "Downloaded"
  library and play back from local files. Off by default.
- **Listening stats:** top tracks and artists, and time listened, built from the existing track
  events.

## 7. Settings and defaults (my calls)

| Feature | Default |
|---|---|
| Ad block (network + pruning + fallback) | On |
| Hide Premium upsells | On |
| Video controls overlay | On |
| Open tracks as video | Off |
| Theme | "Apple Music Dark", background `artwork-blur-cheap` |
| Glass (expensive blur) | Off |
| Now Playing animated background | On (off with reduce-motion) |
| EQ / normalization / transitions / skip silence | Off |
| Force GPU on blocklisted drivers | Off |

New settings go in `defaultSettings`. `player.*` and `themes.*` extend existing groups;
`player.video`, `adblock` and `audio` are new groups. Every new key gets a migration.

## 8. Performance budget and how it's measured

Measured by the phase 0 bench on the owner's laptop, as a production build, at 1500×800 and at
fullscreen:

| Scenario | Metric | Budget |
|---|---|---|
| p1 Home idle 10 s | main + renderer CPU avg | Baseline −30% |
| p2 Player page playing, 10 s | frame time p95 (in-page rAF sampler) | ≤ 20 ms |
| p3 Same, maximized | frame time p95 | ≤ 20 ms |
| p3b Same, YTM HTML fullscreen (video) | frame time p95 | ≤ 20 ms |
| p4 Resize sweep (20 steps) | frames until views match window | ≤ 1 |
| p5 Enter/leave fullscreen | view bounds correct after | ≤ 1 frame |
| p6 Minimized while paused, 60 s | total app CPU avg | < 1% |
| p7 Minimized while playing, 120 s | audio keeps playing (currentTime advances) | must pass |
| p8 Now Playing open, lyrics scrolling | frame time p95 | ≤ 20 ms (phase 4+) |

Phase 1 starts by recording the baseline. A budget that turns out wrong on real hardware gets
adjusted in this document with the measured numbers, not quietly loosened in code.

**Backgrounding switches (phase 1, Task 7, measured 2026-10-25, RTX 3060 Ti).** The four
process-wide switches `disable-renderer-backgrounding`, `disable-background-timer-throttling`,
`disable-backgrounding-occluded-windows` and the `CalculateNativeWinOcclusion` feature were kept only if
removing them cut p6 CPU by at least 30% with p7 passing. Measured: removed, p6 0.26% and p7 120.16 s
in 120 s; kept, p6 0.25% and p7 120.16 s in 120 s (baseline p6 0.28%). No gain, so they stay. App
views (toolbar, loading, notices) still rest when hidden through per-view `backgroundThrottling`;
only the YouTube view opts out.

**p7 baseline failure (49.39 s in 120 s) was the measurement, not playback.** The signed-out bench
profile gets pre-roll ads (seen: a 15 s ad, then a 265 s one) that play in the same `<video>` as the
track, so the old p7 read the ad's `currentTime` and then a reset. Playback itself advanced in real
time while minimized. The bench now skips ads before measuring and p7 sums media time across resets.

## 9. What's left to the builder

- Exact file and module boundaries inside each plugin, test names, and scenario numbering beyond
  what's listed.
- Whether `volumeRatio` merges into normalization (read it first).
- The romanization and translation libraries (phase 6). Pick small, maintained ones and measure
  bundle size.
- The exact palette values for presets.
- How to relay the Now Playing position (IPC channel shape), as long as it stops when the view is
  hidden.
