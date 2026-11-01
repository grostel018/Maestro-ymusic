# Maestro (formerly YTMDesktop2 Plus) — Master Roadmap (end to end)

Date: 2026-10-25 · Branch: `feature/desktop-overhaul` · Supersedes the roadmap in
`docs/superpowers/specs/2026-10-25-desktop-music-overhaul-design.md` §6. That design's goals,
anti-goals and constraints (§2–§3) still apply.

This is the single source of truth for **what** we build, **in which order**, **where each piece
comes from**, and **how each step is tested and documented**. Every phase gets a short execution
plan of 4–6 tasks generated from its section here. Don't add a feature that isn't listed here
without first adding it to §13 (Backlog intake).

---

## 0. The goal in one paragraph

A Windows music player that feels like Apple Music, built on the owner's own YouTube Music
account, with Metrolist-level features and more. It has:

- **No ads.**
- **Smooth playback:** no lag, no broken playback.
- **Easy audio ⇄ video switching.**
- **A YouTube-grade video player.**
- **A serious audio lab:** output device choice, a good equalizer, surround, pitch and
  normalization.
- **Themes** with a blurred song or video background.
- **Phone-style synced lyrics.**
- **Song and artist facts, and YouTube comments.**
- **Sign-in to Google and Last.fm that works the first time.**

Everything is reused from proven open-source projects wherever possible. Everything can be
switched off. Everything is documented so others can collaborate.

---

## 1. Working rules (apply to every phase)

### 1.1 Reuse before building

1. **Look for existing work first.** For each feature, search §3 (Reuse map) before writing
   code. When a source is listed, **port it**: copy the logic, adapt it to our plugin API, and
   translate the language if needed. Writing from scratch is the exception, and the reason goes
   in `docs/REUSE.md`.
2. **Acceptable sources:**
   - open-source projects with **≥ 1.5k GitHub stars**, or
   - libraries already shipped by such a project (Pear Desktop's dependencies count),
   - or public data services (Wikipedia, MusicBrainz, Last.fm, LRCLIB).
3. **Reference clones** live outside the repo in `C:\Users\Rostel\Desktop\youtube-music\reference\`.
   - They are read-only and never run.
   - Each one's commit SHA is pinned in `docs/REUSE.md`.
   - Already cloned: `pear-desktop` @ `7c55260` (MIT).
4. **License rules.** Every ported file gets a header:
   `// Ported from <repo>@<sha>:<path> (<license>) — <what changed>`.
   - **MIT / Unlicense / MPL-2.0** (file-level): port freely and keep the notice.
   - **GPL-3.0** (Metrolist, Better Lyrics, NewPipe, SponsorBlock, uBlock): porting *code* makes
     the fork GPL-3.0 and blocks upstream PRs for those parts. That's a decision for the owner
     (D1 in §11). Until it's made, take **ideas and data formats only** from GPL sources, not
     code.

### 1.2 Speed (we keep these, they're why phase 2+ will be fast)

- **Native execution.** One agent builds a whole phase in order. There are no per-task review
  hand-offs.
- **One review per phase.** The strongest model reviews the whole phase diff once, then there's
  one fix wave.
- **Short phase plans:** 4–6 tasks each, written from this roadmap in under 15 minutes.
- **Test once, at the end** (owner rule, 2026-10-27, replaces the per-task tiers). While building,
  run unit tests and the typecheck only, and don't launch the app. At the end of the phase, run
  `pnpm t:smoke` once (3–5 min); fix failures by rerunning only the failing scenario. The full and
  perf suites run only when the owner asks. Trust the code: test the main path, not every button.
- **Small Conventional Commits** per task (`feat(eq): …`) with the Biome hook on. Upstream
  conventions still apply: see the `follow-upstream-contribution-policy` memory.

### 1.3 Definition of done (every feature)

A feature is done only when all of these hold:

1. It's a plugin (or a provider with a setting) and can be **switched off**. Heavy parts load
   lazily and stop when hidden.
2. **The settings UI exists** (a page or a section), and each new settings key has a migration.
3. **Pure logic has unit tests** (vitest).
4. **The phase's main path is in the smoke set.** At most one new smoke scenario per phase, covering
   what the phase is for. No scenario per feature or per button.
5. **`docs/features/<feature>.md`** exists: what it does, settings, source, limits, and how to
   test it.
6. **`docs/REUSE.md`** has an entry: the source repo, SHA, license and what was ported.
7. **The item moves to Done** in `IMPROVEMENTS.md` (and a `checks.ts` row when the phase adds a
   scenario).
8. **Performance** is not measured per phase for now; the owner asks for a perf pass when wanted.

### 1.4 Never-break rules (from the design's anti-goals)

- Playback must never stall, go silent or stick at a wrong speed because of our code. Every
  audio stage has a bypass, and errors fall back to the plain signal.
- Startup must never wait on network work for more than 3 s.
- Nothing may touch the installed upstream app's profile (`%APPDATA%\ytmdesktop2`,
  `YouTube Music for Desktop`).
- No full-screen `backdrop-filter`, no animation loops running while hidden, and no per-frame
  work over 2 ms on the main thread.

---

## 2. Testing overhaul (phase A builds this; every later phase uses it)

**The problem today:** every scenario launches a fresh app, loads YouTube over the network and
often plays through ads. Each run also rebuilds. A task's test loop takes 5–20 min, and a phase
takes hours.

| Tier | Command | What runs | Target time | When |
|---|---|---|---|---|
| Unit | `pnpm t:unit` | vitest, pure logic only | < 30 s | Every edit |
| Smoke | `pnpm t:smoke [area]` | Scenarios tagged `smoke` (and the area), **sharing one app launch** | < 3 min | Every task |
| Full | `pnpm t:full` | Every functional scenario, shared launches where safe | < 15 min | Phase end |
| Perf | `pnpm t:perf` | `pNN` scenarios | ~10 min | Phase end only |
| Account | `pnpm t:account` | `account: true` scenarios on the throwaway signed-in profile | < 5 min | Phase end, when sign-in is touched |

How it gets fast:

1. **A shared launch.** Scenarios declare `needs: { fresh?: boolean, settings?, account? }`.
   - The runner groups scenarios with compatible needs into one launch.
   - It resets state between them: navigate home, pause, reset settings through
     `__YTMD_TEST__`.
   - Only scenarios that test startup or migrations ask for `fresh`.
2. **A build cache.** `scripts/build-if-changed.mjs` hashes `src/**`, `electron.vite.config.ts`
   and `package.json`. If the hash matches `out/.build-hash`, the build is skipped. This saves
   1–2 min per run.
3. **Ad-free test playback.** The ad blocker is on in every scenario except the
   ad-block-specific ones, so `play()` never waits through pre-rolls.
4. **Tags.** Each scenario has a `tags: ["smoke"|"full"|"perf"|"account", "<area>"]` field, and
   `--area eq` runs only that area.
5. **Fail fast.** On the first failure the runner stops (unless `--keep-going`), saves a
   screenshot, the last 200 log lines and the CDP console errors to `results/<id>/`, and prints
   their paths.
6. **Bench hardening** (deferred minors from phase 0, now required):
   - an unknown scenario id is an error,
   - a port preflight on 9361/9362,
   - `proc.on("error")`,
   - consent matching that isn't English-only,
   - top-level errors teed to the log,
   - a CDP connect timeout.
7. **Local mock servers** for third-party APIs (Last.fm, Wikipedia, MusicBrainz, LRCLIB, the
   Genius proxy):
   - `tests/e2e/mocks/*.ts`, served by one tiny Node HTTP server.
   - The app reads base URLs from `YTMD_E2E_API_<NAME>` only when `YTMD_E2E=1`.
   - Tests become deterministic and need no keys.
8. **One app run per phase** (2026-10-27): `t:smoke` at the end only; `t:full` and `t:perf` on the
   owner's request.

`docs/TESTING.md` documents all of this. It replaces the scattered notes.

---

## 3. Reuse map (where each feature comes from)

Star counts and licenses checked 2026-10-25.

| Source | ★ | License | What we take |
|---|---|---|---|
| **pear-devs/pear-desktop** (ex th-ch/youtube-music; Electron + YTM, same architecture as us) | 33.9k | MIT | Plugins (paths in `reference/pear-desktop/src/plugins/`):<br>• `custom-output-device` (135 lines)<br>• `crossfade` (707)<br>• `skip-silences` (157)<br>• `ambient-mode` (454)<br>• `video-toggle` (484)<br>• `quality-changer` (144)<br>• `captions-selector` (304)<br>• `playback-speed` (234)<br>• `picture-in-picture` (545)<br>• `visualizer` (533)<br>• `music-together` (2561)<br>• `synced-lyrics` (3443, providers + parsers)<br>• `scrobbler` (887, Last.fm in-app auth + ListenBrainz)<br>• `album-color-theme` (360)<br>• `audio-compressor` (133)<br>• `precise-volume` (540)<br>• `downloader` (2269)<br>• `sponsorblock` (174)<br>• `performance-improvement` |
| **jaakkopasanen/AutoEq** | 16.4k | MIT | Headphone correction profiles (`ParametricEQ.txt` format), fetched on demand by model name |
| **LuanRT/YouTube.js** (`youtubei.js`, already a Pear dependency) | 5.4k | MIT | YouTube comments (`getComments`), extra metadata |
| **peers/peerjs** | 13.5k | MIT | Listen-together transport (via Pear `music-together`) |
| **jberg/butterchurn** | 2.0k | MIT | Milkdrop visualizer (via Pear `visualizer`) |
| **hexenq/kuroshiro** (+ kuromoji analyzer, Pear dependencies) | 1.0k* | MIT | Japanese romaji. *Below 1.5k, but allowed because Pear ships it |
| **fast-average-color** | 1.5k | MIT | Album / video dominant color (Pear `album-color-theme`) |
| **spicetify/spicetify-themes** | 6.1k | MIT | Theme palettes to seed our presets |
| **ghostery/adblocker** | 1.0k* | MPL-2.0 | Already in use. *Allowed (major vendor library) |
| **yt-dlp/yt-dlp** | 202k | Unlicense | Optional downloads backend; cookie-import logic reference (D2) |
| **MetrolistGroup/Metrolist** | 13.8k | GPL-3.0 | **Ideas only** until D1: feature list, palettes concept, metroserver protocol |
| **better-lyrics/better-lyrics** | 1.0k | GPL-3.0 | Already used as a lyrics *service*; ideas only for UI |
| **TeamNewPipe/NewPipeExtractor** | 2.0k | GPL-3.0 | Ideas only (comments paging), until D1 |
| **ajayyy/SponsorBlock** | 14.0k | GPL-3.0 | Its **public API** (data, not code) through the Pear `sponsorblock` port (MIT) |
| Public data APIs | — | various | Wikipedia REST, MusicBrainz, Last.fm `artist.getInfo` / `track.getInfo`, LRCLIB, Genius (optional key) |

Non-reuse (we build it, because no good source exists):

- **The audio engine graph manager.** Pear's plugins each wire themselves into the audio chain,
  so their order is fragile. We need one ordered chain.
- **Crossfeed.** It's a small, well-known algorithm (Bauer stereophonic-to-binaural),
  implemented with Web Audio filters.
- **The Apple-style lyrics renderer.**

---

## 4. Phase A — Speed and foundations (≈ 2–3 h)

**Goal:** fast, trustworthy tests; documentation and reuse scaffolding; no feature changes.

| # | Task | Files | Tests / acceptance |
|---|---|---|---|
| A1 | **Tiered runner + shared launch + tags + fail-fast** (§2 items 1, 4, 5, 8) | `tests/e2e/run.ts`, `tests/e2e/lib/app.ts`, new `tests/e2e/lib/session.ts` (state reset), all `scenarios/*.ts` (add `tags`/`needs`) | `pnpm t:smoke` runs the existing smoke subset in **< 3 min**; `pnpm t:full` still 19/19; unit test for the grouping function |
| A2 | **Build cache + scripts** `t:unit`, `t:smoke`, `t:full`, `t:perf`, `t:account` (§2 item 2) | `scripts/build-if-changed.mjs`, both `package.json`s | A second `t:smoke` without changes skips the build (log line `build: cached`) |
| A3 | **Bench hardening + mock API server** (§2 items 6, 7) | `tests/e2e/lib/app.ts`, `tests/e2e/lib/cdp.ts`, `tests/e2e/mocks/server.ts`, `src/shared/e2e/apiBase.ts` (reads `YTMD_E2E_API_*` only under `YTMD_E2E=1`) | `run.ts s99` → error "unknown scenario"; occupied port → clear error; unit test for `apiBase` |
| A4 | **Docs skeleton + reuse register** | `docs/ARCHITECTURE.md` (processes, views, plugin system, page world vs preload vs main, settings and migrations, audio engine slot); `docs/TESTING.md`; `docs/REUSE.md` (table from §3 + per-port entries); `docs/DECISIONS.md` (ADR log, seeded with phase 0/1 rulings from the ledger); `docs/features/_TEMPLATE.md`; `AGENTS.md` (rules for AI collaborators: these working rules, test tiers, never-break rules); README "Fork" section | Docs reviewed in the phase review; links valid |
| A5 | **Phase review + fix wave** | — | Full + perf once; `VERIFICATION.md` regenerated |

---

## 5. Phase B — Sign-in that works the first time (≈ 3 h)

### Diagnosis (from code, 2026-10-25)

**Google:**
- The login runs in the app's own built-in Chromium window (`src/main/windows/view.ts`
  `googleLoginPopup`). It has its own cookie storage, so it can never reuse your Firefox
  session. Any desktop app that embeds YouTube Music works this way.
- The window is modal and always-on-top, which feels like a separate stuck window.
- It pretends to be **Firefox 92 (2021)** (`src/main/infra/userAgent.ts`
  `getGoogleLoginUserAgent`). Google flags outdated browsers ("this browser or app may not be
  secure"), which is the "not legitimate" feeling.

**Last.fm:**
- The fork has **no Last.fm API key** (`VITE_LASTFM_API` / `VITE_LASTFM_SECRET` missing from
  `.env.local`), so the integration is disabled.
- Upstream builds use the maintainer's key, so Last.fm shows *their* app.
- Auth goes through your default browser and returns through a `ytmd://` deep link. With the
  upstream app also registered, the callback can land in the wrong app. With the old token
  polling, that gives the "sign in 10 times" loop.
- Pear avoids all of this with an **in-app Last.fm window** that watches for the success page
  (`reference/pear-desktop/src/plugins/scrobbler/services/lastfm.ts` `authenticate`).

| # | Task | Details | Tests / acceptance |
|---|---|---|---|
| B1 | **Google login window rework** | Window and user agent:<br>• A normal, resizable window, centered on the main window.<br>• Not always-on-top and not modal.<br>• A current Firefox **ESR** user agent kept in one constant with a "last checked" date, plus a fallback list.<br><br>Errors and guidance:<br>• Detect Google's "browser not secure" / "couldn't sign you in" pages and show a clear message with a Retry option.<br>• Keep the window open across 2FA and passkey pages.<br>• Close automatically when `music.youtube.com` is reached signed in, then reload the YouTube view.<br>• A note in Settings explains that sign-in is one-time per app profile. | Unit: UA constant format, error-page matcher.<br>Smoke (mock): the popup opens, the mocked "not secure" page shows guidance, success closes the popup.<br>Account (manual, throwaway account): sign in once, restart, still signed in. |
| B2 | **Optional: "Import Google sign-in from Firefox"** (needs decision D2) | Reads `cookies.sqlite` from the chosen Firefox profile (unencrypted on Windows) for `.youtube.com` / `.google.com`, after an explicit confirmation dialog, then copies those cookies into the app session. The approach follows yt-dlp `--cookies-from-browser` (Unlicense). The app never stores passwords and never sends cookies anywhere. | Unit: sqlite parse on a fixture DB. Manual: owner-run only. |
| B3 | **Last.fm via in-app window** (port of Pear `scrobbler/services/lastfm.ts`, MIT) | Auth flow:<br>• Replace the browser + deep-link flow with `auth.getToken`.<br>• Open an in-app window at `last.fm/api/auth?api_key&token`.<br>• Detect success by URL, then call `auth.getSession`.<br>• One flow at a time; cancel on close.<br><br>Storage:<br>• Store the session in `secureStore` (now in the fork's own folder).<br>• Drop the `ytmd://`-callback path for Last.fm; keep it parsing for old links.<br><br>Keys and errors:<br>• Keys come from `.env.local` and are documented.<br>• Clear error states: missing key, rejected, network. | Unit: signature builder (md5 of sorted params), success-URL matcher.<br>Smoke (Last.fm mock server): connect → session stored → scrobble sent → restart → still connected, with **one** sign-in. |
| B4 | **Owner setup: Last.fm API account** | Docs page `docs/features/lastfm.md`:<br>1. Create a free API account at last.fm/api/account/create (application name "YTMDesktop2 Plus"; callback can be left empty because of the in-app flow).<br>2. Put `VITE_LASTFM_API` and `VITE_LASTFM_SECRET` in `apps/ytmdesktop2/.env.local`.<br>3. Rebuild.<br><br>The owner does steps 1–2 (credentials are theirs). | The doc exists; the app shows "Last.fm not configured — see docs" when keys are missing. |
| B5 | ~~ListenBrainz~~ | Dropped (owner decision D5, 2026-10-26). | — |
| B6 | **Phase review + account smoke** | One signed-in smoke on the throwaway account: login persists, the played track appears in History (the manual check left over from phase 1). | `t:account` |

---

## 6. Phase C — Playback freedom (≈ 3–4 h)

| # | Task | Reuse | Details | Tests |
|---|---|---|---|---|
| C1 | **One-click audio ⇄ video** | Pear `video-toggle` (MIT) | Behavior:<br>• A toggle button in our toolbar and the YTM player bar.<br>• Shortcut `V`.<br>• It remembers the last mode, globally or per song type (setting).<br>• Switching keeps the playback position and never restarts the track.<br>• In audio mode, video decoding is hidden or paused where YTM allows (CPU saving).<br>• **The button must always show** (owner report 2026-10-26: no switch visible). YTM only shows its Song/Video switch for some tracks and hides it signed out, so we inject our own control rather than rely on YTM's; where YTM has no audio counterpart, the toggle hides the video and keeps the stream. | Smoke: toggle 5× during playback, position monotonic, no pause; perf: audio mode CPU ≤ video mode |
| C1b | **Real song version and cover in Song mode** (owner report 2026-10-26) | Our lyrics matcher + YTM search | See `docs/superpowers/plans/2026-10-26-c1b-real-song-version.md`: find the song (ATV) by search when YouTube sends no twin, swap to it at the same position, else show its album art. | s21, s22 |
| C2 | **YouTube-grade video controls** (done 2026-10-26, see `docs/superpowers/plans/2026-10-26-phase-c2-c4.md`) | 1st choice: **re-enable YouTube's own control bar** (`.ytp-chrome-bottom` inside `#movie_player`, hidden by YTM CSS); a 10-minute probe decides. Else port Pear `quality-changer`, `captions-selector`, `playback-speed`, `picture-in-picture`. | Controls:<br>• Quality (up to the stream maximum, remembers the `player.res` preference).<br>• Speed 0.25–2× plus custom.<br>• Captions with language selection.<br>• Loop.<br>• Picture-in-picture.<br>• Theater mode (fills the window).<br>• Fullscreen (the phase-1 HTML fullscreen path).<br><br>YouTube's keyboard shortcuts:<br>• `k` / space play/pause, `j` / `l` ±10 s, ← / → ±5 s.<br>• `,` / `.` frame step, `<` / `>` speed, `0–9` seek.<br>• `f` fullscreen, `m` mute, `c` captions, `i` picture-in-picture, `t` theater.<br>• Active only while the player is focused, so they don't clash with global shortcuts. | Unit: shortcut map; smoke: set 0.5× and 1080p (where available), captions on, PiP opens and closes, keys work |
| C3 | **Audio output device selector** | Pear `custom-output-device` (MIT) | Behavior:<br>• Device list via `enumerateDevices`, with labels.<br>• Main grants the `media` permission only to the app's own pages with `setPermissionRequestHandler`, so no microphone prompt appears and nothing records.<br>• Applied with `AudioContext.setSinkId` (via the engine, D1), or `HTMLMediaElement.setSinkId` when the engine is off.<br>• Hot-plug updates the list.<br>• Falls back to the default device if the chosen one disappears, with a toast. | Unit: fallback logic; smoke: list non-empty, switching to "default" keeps playing |
| C4 | **Speed and keep-pitch** | Pear `playback-speed` | The speed control also works in audio mode. "Keep pitch" maps to `preservesPitch`. (Real pitch shift comes in D6.) | Smoke: 1.25× keeps playing; pitch toggle flips `preservesPitch` |
| C5 | **Phase review** | — | Smoke once (rule 2026-10-27) | |

---

## 7. Phase D — Audio engine and audio lab (≈ 6–7 h)

**Done 2026-10-26**, see `docs/superpowers/plans/2026-10-26-phase-d-audio-lab.md` (rulings: pitch without an
AudioWorklet, crossfade as fade out/in, AutoEq fetched by main, Butterchurn to the backlog).

### D1 — Audio engine core (built first; everything else plugs into it)

`src/renderer-plugins/youtube/audio-engine/` (page world):

- **One `AudioContext`** per page. One `MediaElementSource` per `<video>` element, re-attached
  when YTM swaps the element (the phase-1 skipper bug class).
- **A fixed, ordered chain:**
  1. `input` (normalization gain)
  2. `eq`
  3. `spatial`
  4. `karaoke`
  5. `pitch`
  6. `dynamics` (compressor / limiter)
  7. `fade` (crossfade / sleep)
  8. `analyser` tap (visualizer, silence detection)
  9. `output` (`setSinkId`)
- **Stages are registered by id.** Each stage has `enabled`, `build(ctx)`, `dispose()` and
  `update(settings)`. A disabled stage is skipped, not bypassed with extra nodes.
- **When every stage is off**, the engine disconnects completely and the element plays natively.
  That costs nothing and is the safest state.
- **Errors:** an exception in a stage disables that stage, logs it, keeps the rest, and shows a
  toast "Equalizer disabled after an error".
- **The engine emits** `ytmd:audio-graph` with the current chain, for the tests and the
  settings UI.
- **Unit tests** use a fake `AudioContext` (node graph recorder): order, bypass, swap, error
  isolation.
- **Smoke:** enable 3 stages, then disable all; `currentTime` advances throughout; there's no
  silence gap longer than 200 ms (analyser).

### D2–D8

| # | Feature | Reuse | Details | Tests |
|---|---|---|---|---|
| D2 | **Equalizer** | Pear `equalizer` (presets format); AutoEq (MIT) data | Modes and presets:<br>• **Graphic** 10-band (32 Hz–16 kHz).<br>• **Parametric** (up to 10 filters: peaking, low/high shelf; frequency, Q, gain).<br>• Presets: Flat, Bass Boost, Bass Reducer, Vocal, Treble, Loudness, Acoustic, Electronic, Hip-Hop, Classical, Rock, Pop, Late Night.<br>• User presets with import and export.<br><br>Headphone correction:<br>• **AutoEq**: search a model name and fetch `ParametricEQ.txt` from the AutoEq repo (raw GitHub, cached in `userData/autoeq/`).<br>• Apply its preamp and filters.<br><br>Safety:<br>• An auto-preamp guard prevents clipping.<br>• An A/B bypass button.<br>• A curve preview (canvas, drawn only while the settings page is open). | Unit: ParametricEQ.txt parser (fixtures), preamp guard; smoke: preset applied changes the analyser spectrum in the expected band |
| D3 | **Surround and spatial** | Built (Web Audio) | Four effects, each optional and combinable within limits:<br>• **Crossfeed** (Bauer BS2B-style, 3 strengths) for headphones.<br>• **Stereo width** (mid/side, 0–200%).<br>• **Virtual surround** (HRTF `PannerNode` placement of L/R at ±30–110°).<br>• **8D rotation** (slow HRTF orbit, speed setting). | Unit: M/S math; smoke: each mode on/off without silence |
| D4 | **Loudness and dynamics** | Pear `audio-compressor`, `precise-volume` | Normalization:<br>• Uses YouTube's `loudnessDb` from the player response.<br>• Target −14 LUFS-style.<br>• Merges with the existing `volumeRatio` plugin.<br><br>Dynamics and volume:<br>• A compressor or limiter (presets: Off, Gentle, Night).<br>• Precise volume (1% steps, scroll wheel, on-screen volume indicator). | Unit: gain calculation; smoke: loud/quiet track gains differ |
| D5 | **Transitions and timing** | Pear `crossfade` (707 lines), `skip-silences` | Transitions:<br>• Crossfade 1–12 s, with true overlap where Pear's fader supports it.<br>• Otherwise fade out / fade in.<br><br>Silence and sleep:<br>• Skip silence (−50 dB > 1.5 s, mid-track or at the tail).<br>• **Sleep timer** (minutes, or end of track; 10 s fade, then pause). | Smoke: track change with crossfade on, no stall; sleep timer pauses |
| D6 | **Karaoke and pitch** | Karaoke built (M/S cancel + band-limited); pitch: SoundTouch worklet (port of SoundTouch algorithm, LGPL-2.1 — **decision D3**: alternatively the Web Audio `playbackRate` + `preservesPitch` trick, which covers ±tempo but not pure pitch) | Karaoke:<br>• A vocal reduction slider (Apple "Sing" style).<br><br>Pitch:<br>• Shift ±6 semitones.<br>• Key display where the metadata has it. | Smoke: karaoke changes the mid energy; pitch stage on/off no stall |
| D7 | **Visualizer** | Pear `visualizer` (butterchurn, vudio, wave; MIT) | Behavior:<br>• Optional overlay in Now Playing / fullscreen.<br>• Lazy-loaded, 30 fps cap.<br>• Paused when hidden. | Perf: off = zero cost; on = p95 within budget |
| D8 | **Audio settings page + phase review** | — | One "Audio" settings section:<br>• Output device.<br>• Equalizer.<br>• Spatial.<br>• Dynamics.<br>• Transitions.<br>• Karaoke and pitch.<br>• Visualizer.<br><br>A live "chain" view shows which stages are on. | Full + perf |

---

## 8. Phase E — Look and feel (≈ 4 h)

**Done 2026-10-30:** palettes, accent, corners, theme import/export (E1); video ambient and song color backgrounds
(E2); title bar with back, forward, search and a now-playing pill (E3). Light mode not done (dark palettes only).
See `docs/features/themes.md`.

| # | Task | Reuse | Details | Tests |
|---|---|---|---|---|
| E1 | **Theme engine** | spicetify-themes palettes (MIT), Metrolist palette *ideas* | Design doc §6 phase 3, unchanged:<br>• Modes: light, dark, black, dynamic.<br>• Tokens become CSS variables in both the YouTube page and the React views.<br>• About 20 presets.<br>• Accent picker.<br>• Font.<br>• Corner radius.<br>• Density.<br>• `.ytmdtheme.json` import / export.<br>• Custom SCSS on top. | Unit: token compiler; smoke: switch preset → page and toolbar colors match |
| E2 | **Blurred song / video background** | Pear `ambient-mode` (MIT), our phase-1 pre-blurred artwork, Pear `album-color-theme` + fast-average-color | Three background modes:<br>• **Artwork** (existing cheap blur).<br>• **Video ambient:** a canvas sampled from the video at **4 fps**, downscaled to 32 px, blurred once, cross-faded; paused when hidden or in audio mode.<br>• **Dynamic color** gradient from the dominant colors. | Perf: ambient on → p95 within budget, CPU delta < 2% |
| E3 | **Apple-style top bar** | Built (existing React toolbar) | Design doc §6 phase 3:<br>• Centered "LCD" now-playing pill.<br>• Back / forward and search.<br>• Window controls. | Smoke: pill shows the current track, click opens Now Playing (F1) |
| E4 | **Phase review** | — | Smoke once (rule 2026-10-27) | |

---

## 9. Phase F — Now Playing, lyrics, facts, comments (≈ 6–7 h)

**Done 2026-10-30:** F2 Apple-style lyrics, F3 About panel, F6 karaoke. F1, F4 and F5 use what YouTube Music now
has (its player page is the Now Playing view, opened by the title-bar pill; its Comments tab; its Up next with drag
to reorder), see DECISIONS. Romanization and translation lines done 2026-11-01.

| # | Task | Reuse | Details | Tests |
|---|---|---|---|---|
| F1 | **Now Playing view** | Built (React); design doc §6 phase 4 | Full-window view, opened with F11 or the toolbar pill.<br><br>Layout:<br>• Large artwork.<br>• Background from E2.<br>• Transport controls.<br>• Right panel with tabs: **Lyrics · Queue · About · Comments**.<br><br>The YouTube view is detached (audio continues). | Smoke: open/close keeps playing; perf: p8 |
| F2 | **Apple-style lyrics** | Our 4 providers; Pear `synced-lyrics` providers/parsers (MIT) as extra providers; kuroshiro for romaji | Display:<br>• Word-by-word fill.<br>• Spring scroll.<br>• Tap a line to seek.<br>• Duet sides and background vocals.<br>• Instrumental dots.<br><br>Extra lines:<br>• **Romaji / romanization line** (kuroshiro for Japanese; Korean and Chinese romanization added in G).<br>• **Translation line** (provider with a key setting; off by default).<br><br>**Owner report 2026-10-26:** today's lyrics feel clunky and laggy, and it isn't clear which line is being sung. F2 replaces the current view, it does not restyle it. Requirements:<br>• Apple Music look: the current line large and bright; past and coming lines dimmed and softly blurred; the next line visible ahead.<br>• Smooth at 60 fps: the clock is interpolated every frame from one player time sample (no 30 Hz cross-world ticks driving React renders); the scroll is one `transform` with spring easing (no native `scrollTo` smooth); the word fill is a GPU gradient/clip update; no layout reads per frame.<br>• Reuse candidate: AMLL ([Steve-xmh/applemusic-like-lyrics](https://github.com/Steve-xmh/applemusic-like-lyrics), GPL-3.0, allowed by D1). Check stars and fit at phase start; port its line-spring and word-fill logic if it qualifies. | Unit: line timing, romaji fixture; smoke: lines advance with playback; **perf: ≥ 55 fps and no long tasks over 30 s of word-synced lyrics** |
| F3 | **Song and artist facts ("About" tab + rotating "Did you know?")** | Public APIs | Sources, in this order:<br>1. **Wikipedia REST** `page/summary` for the song, album and artist.<br>2. **MusicBrainz** (release date, label, writers, producers, instruments; 1 request/s, our User-Agent).<br>3. **Last.fm** `track.getInfo` / `artist.getInfo` (wiki, tags, listeners, play count), using B4's key.<br>4. **Genius** (song description, "Behind the lyrics" style) only if the owner adds a token (D4).<br><br>Processing:<br>• Facts are split into short cards.<br>• Cached per track in `userData/facts/` (7 days).<br>• Fetched only when the About tab opens or the card area is visible. | Unit: card extractor on fixtures; smoke (mock servers): cards render for the test track |
| F4 | **YouTube comments** | `youtubei.js` (MIT) | Fetching:<br>• Uses `Innertube.getComments(videoId)`.<br>• Top comments, sorted Top / Newest, replies on expand, "load more" paging.<br>• Read-only in v1 (posting needs extra auth, so it goes to the backlog).<br>• Fetched only when the Comments tab opens. Cached for 1 h. | Unit: comment mapper on fixtures; smoke: tab shows ≥ 1 comment for the test video |
| F5 | **Queue panel + mini player** | Existing `navigation` service; Pear `album-actions` ideas | Queue panel:<br>• Drag reorder, remove, play next (new page commands on YTM's queue store).<br><br>Mini player:<br>• The existing `trayView` with artwork background, always-on-top option. | Smoke: reorder reflected in YTM queue |
| F6 | **Full-screen karaoke mode** (owner request 2026-10-26) | F1 view + F2 lyrics + D6 vocal reduction; Apple Music "Sing" as the model | Opened from Now Playing or with `K`:<br>• Fullscreen, lyrics only: huge current line with word fill, next line dimmed, artwork background (E2).<br>• Vocal slider (D6) in a small overlay that hides after 3 s; pitch control when D3's SoundTouch lands.<br>• Countdown dots before the first line and in instrumental gaps.<br>• Falls back to line-synced (or plain scrolling) lyrics when a provider has no word timing.<br>• Esc leaves; playback never pauses. | Smoke: enter/exit keeps playing, current line advances; perf: fullscreen frame time within p8 |
| F7 | **Phase review** | — | Smoke once (rule 2026-10-27) | |

---

## 10. Phase G — Extras and the competitor-inspired list (≈ 6 h, pick-and-choose)

**Picked 2026-10-30:** G5 SponsorBlock and G3 listening stats are done. Also added: game mode (owner request).

**Owner decision 2026-11-01:** every remaining G item is built before release, plus the missing gaps from E and F
(light mode, romanization and translation lines). G6 keeps its own condition: only with a ≥ 1.5k★ open solution.
The order is in `docs/superpowers/plans/2026-11-01-road-to-release.md`.

| # | Feature | Inspired by | Reuse | Notes |
|---|---|---|---|---|
| G1 | **Listen Together (Jam)** | Spotify Jam, Metrolist | Pear `music-together` (peerjs, MIT) | Room code, host controls the queue |
| G2 | **Offline downloads** | Metrolist, Spotify | Pear `downloader` (MIT) or yt-dlp | Personal use; a "Downloaded" library |
| G3 | **Listening stats / "Wrapped"** | Spotify Wrapped, Apple Replay | Built from track events | Top tracks, artists, hours; yearly recap page |
| G4 | **Smart shuffle / radio from song** | Spotify Smart Shuffle, Deezer Flow | YTM radio endpoints via youtubei.js | Mix of liked songs + recommendations |
| G5 | **SponsorBlock for music videos** | — | Pear `sponsorblock` (MIT, uses the public API) | Skips non-music intros and outros |
| G6 | **Song recognition** | Deezer SongCatcher, Shazam | Open question | Only if a ≥ 1.5k★ open solution exists, otherwise skip |
| G7 | **Local playlists + import** (CSV, M3U, Spotify export) | Metrolist | Built | Plays through YTM by video ID |
| G8 | **Korean / Chinese romanization, lyrics translation provider options** | Apple Music | Libraries ≥ 1.5k★, chosen in G | Extends F2 |
| G9 | **Animated artwork / canvas loops** | Spotify Canvas, Apple animated covers | YTM video thumbnails | Low priority |

---

## 10b. Phase H — Ready for other people (owner request 2026-11-01; last phase)

**Goal:** someone who isn't technical downloads one file, double-clicks it, signs in and listens. No terminal, no
pnpm, no API keys. The code stays unpushed until phases A–G and H1–H5 are finished; then H6 and H7 run in that order.

| # | Task | Details | Done when |
|---|---|---|---|
| H1 | **Our own icon** (done 2026-11-01) | `build/icon.svg`, rendered by `scripts/generate-icons.mjs`; the conductor M | Every icon file comes from the SVG |
| H2 | **One-click installer and updates** | • A one-click NSIS installer from CI, with a real version number instead of `0.0.0`.<br>• `release.yml` builds from this repo and takes keys from CI secrets.<br>• Update button from Maestro's own releases (item 81); set `FORK.updatesEnabled`.<br>• Uninstall keeps the user's data unless they choose otherwise (today `deleteAppDataOnUninstall: true`).<br>• Code signing so Windows doesn't warn about an unknown publisher: owner decision, see H-keys below. | On a clean Windows account: download, install, open, update, uninstall |
| H3 | **No API keys for users** (proposed, see below) | • Official builds carry Maestro's own Last.fm key; users just approve in the in-app window.<br>• Genius stays optional: the About panel works from Wikipedia, MusicBrainz and Last.fm without it.<br>• An advanced "use my own key" field for when a shared limit is hit.<br>• Maestro's own Discord application, so Rich Presence says Maestro.<br>• A clear message when a service is unavailable, never a raw error. | A build made with no local `.env.local` connects Last.fm by login alone |
| H4 | **First-run welcome** | A short, skippable welcome: sign in to Google (or continue signed out), optional Last.fm, what's on by default, where Settings is. Shown once. Errors in plain words with one obvious next step. | A new profile reaches music in under a minute without help |
| H5 | **Easy user guide and demo** (items 77, 80) | A short guide with pictures: install, sign in, Windows warning, equalizer, lyrics, uninstall, getting help. README screenshots and a demo clip. | A non-technical reader can follow it alone |
| H6 | **Security audit** (item 79), **last before publishing** | Whole-app review with fixes:<br>• keys and tokens in builds and in git history,<br>• the local API server and its auth,<br>• what the in-app windows and page-world code can reach (IPC, permissions, navigation),<br>• the Firefox cookie import and where sign-in data is stored,<br>• updates and downloads (HTTPS, signatures),<br>• dependency audit.<br>Findings are fixed or written down. | No open high-severity finding |
| H7 | **Publish** (items 77, 78) | Push, make the repo public, first release, then the Reddit and forum posts. | People can download it |

**H-keys, proposed answer (owner can overrule):** users never type keys. Sign-in is per person, keys are per app:
Last.fm gives the app one key, and each user approves it on their own account. A key inside an installer can be
extracted, so it is treated as replaceable: it grants no access to anyone's account by itself, and it can be swapped
in an update if abused. The personal Genius token doesn't ship.

**Open owner decision, code signing:** unsigned installers show "Windows protected your PC" to every new user. Check
current prices and eligibility at phase start (paid certificates, Azure Trusted Signing, SignPath's free plan for open
source). Without signing, the guide must show how to get past the warning.

## 11. Decisions only the owner can make (asked once, when the phase starts)

Owner answers, 2026-10-26:

| ID | Question | Decision |
|---|---|---|
| D1 | Allow porting **GPL-3.0 code**? | **Yes.**<br>• The fork's license changes to GPL-3.0 when the first GPL code lands: update `LICENSE`, README and `docs/REUSE.md` in that same commit.<br>• Upstream PRs stay possible only for parts with no GPL code. |
| D2 | **"Import Google sign-in from Firefox"**? | **Yes.**<br>• Built in phase B (B2): opt-in, local only, cookies never leave the machine, and an explicit confirmation each time.<br>• Risk to tell the owner: Google may ask to re-confirm the account on the first import. |
| D3 | Real pitch shift via the LGPL SoundTouch port? | **Yes, if feasible.**<br>• LGPL is compatible with the GPL fork.<br>• Port it in D6, with a fallback to speed-linked pitch if the AudioWorklet port proves unstable. |
| D4 | **Genius** | **Update 2026-10-26:** the owner registered a Genius API client ("Maestros").<br>• The client access token goes in `apps/ytmdesktop2/.env.local` as `VITE_GENIUS_TOKEN` (gitignored).<br>• Phase F uses the official API first (`api.genius.com`, Bearer token), and the keyless path below only as a fallback.<br><br>Original note: the owner wants Genius if it needs no key.<br>• Phase F tries Genius's **keyless public web endpoints** (`genius.com/api/search/song`, `/api/songs/:id`) **from inside the app's Chromium**. Plain scripts get a bot-protection page (checked 2026-10-26).<br>• If they work: song descriptions and "behind the lyrics" facts, cached and rate-limited.<br>• If they don't: an optional token field in settings, plus Wikipedia, MusicBrainz and Last.fm. |
| D5 | **Last.fm key** | The owner wants to reuse upstream's key, since this is a fork.<br>• That key is **not in the source code**. It's a private secret injected by Venipa's release pipeline (`.github/workflows/release.yml`: `secrets.LASTFM_API` / `LASTFM_SECRET`), so it only exists inside their official builds.<br>• Extracting it from an installed build would be using the maintainer's private credentials without permission, so we won't.<br>• Options for the owner:<br>  (a) ask Venipa (GitHub issue/Discord) whether forks may use it;<br>  (b) the one-form Last.fm registration (about 2 minutes), with a step-by-step guide shipped in phase B.<br>• **No ListenBrainz** (owner: not needed).<br>• Phase B still fixes the login loop and moves to the in-app auth window, so Last.fm works the moment a key is present. |
| D6 | Account for signed-in tests | The owner trusts us to use their **real Google account**, imported from Firefox via D2 into an **isolated bench profile**.<br>• The tests are read-only: sign-in persists, the track shows in History. No likes, subscriptions or playlist edits.<br>• Ad-block scenarios still run signed out. This costs nothing, and it keeps repeated ad tests away from the real account. |

---

## 12. Order, sizes, milestones

| Order | Phase | Est. | Milestone you can try |
|---|---|---|---|
| 1 | A Speed & foundations | 2–3 h | `pnpm t:smoke` in < 3 min; docs exist |
| 2 | B Sign-in | 3 h | Google once, Last.fm once, both stick |
| 3 | C Playback freedom | 3–4 h | Audio ⇄ video in one click, full video controls, pick your DAC |
| 4 | D Audio lab | 6–7 h | EQ with your headphone profile, surround, crossfade, sleep timer |
| 5 | E Look | 4 h | Themes and the blurred song/video background |
| 6 | F Now Playing | 6–7 h | Lyrics like the phone, facts, comments |
| 7 | G Extras | ~6 h | Pick from the list |
| 8 | H Ready for other people | ~2 days | One-click install, no keys, audited, published |

Each phase:
- **Starts** by generating its 4–6 task plan from this file and asking the phase's D-questions.
- **Ends with** one review, `VERIFICATION.md` regenerated, `IMPROVEMENTS.md` updated, the
  feature docs written, and a short "what to try" note for the owner.

## 13. Backlog intake

A new idea goes to `IMPROVEMENTS.md`, with a weight, an effort and a phase letter. It enters a
phase only when that phase's plan is written. Ideas raised in the middle of a phase wait for the
next phase plan, unless they're bug fixes.

## 14. Tracking against the owner's goals (nothing forgotten)

| Owner goal | Where |
|---|---|
| Apple Music feel, own YTM playlists | E3, F1, F2 (design doc §1) |
| Metrolist feature parity | §3 + phases C–G (design doc §5 map) |
| No ads | Done (phase 1); kept on in all tests |
| Smooth, no slowdown, no new bugs | §1.3, §1.4, §2, perf at every phase end |
| Reuse ≥ 1.5k★ projects, translate when needed | §1.1, §3, `docs/REUSE.md` |
| Audio output selector | C3 |
| Good equalizers | D2 (+ AutoEq) |
| Surround | D3 |
| Pitch | C4, D6 |
| Easy audio ⇄ video | C1 |
| YouTube-grade video (resolution, speed, …) | C2 |
| Good themes | E1 |
| Blurred background from song/video | E2 |
| Phone-style lyrics | F2 |
| Random song/artist facts | F3 |
| Comments | F4 |
| Apple / Spotify / Deezer ideas | §10 (G1–G9), D5 sleep timer, D6 karaoke |
| Full-screen karaoke mode | F6 (uses D6 + F2) |
| Lyrics work for every song | F2 (provider fallbacks; owner report 2026-10-26) |
| Fix Google + Last.fm sign-in | Phase B |
| Faster development and testing | §1.2, §2, Phase A |
| Documentation for collaboration | A4, §1.3 item 5–6, `AGENTS.md` |
