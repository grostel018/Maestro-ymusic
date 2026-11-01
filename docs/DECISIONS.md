# Decision log

Short records of decisions that shape the code, so collaborators know **why**. Newest first.
Format: what we decided, why, what it costs if wrong. The full per-task record for phases 0–1 is
in `docs/superpowers/plans/2026-10-25-phase0-1-ledger.md`.

## 2026-11-01: Game mode no longer drops the video to 144p
- **Found by s9:** switching quality on minimize stalled playback every time (3.50–3.63 s advanced in 5 s, one
  `waiting` event, in 3 of 3 runs; without the switch 5.01 s and no `waiting`, in 3 of 3).
- **Decision:** remove the switch. It broke the rule that playback never stalls, for a small saving on a video that
  isn't being drawn. This replaces the 144p part of the 2026-10-30 game mode entry.
- **Cost if wrong:** a game shares a little more decoding work with a minimized Video mode. Song mode is unaffected.

## 2026-11-01: The app is now Maestro
- **Decision (owner):** product name, app id, executable and link scheme become Maestro. Settings → About and the
  README link to the original project, Venipa/ytmdesktop2. Older entries below keep the old names as history.
- **Kept on purpose:** the profile folders (`ytmdesktop2-plus`, dev `ytmdesktop2-dev`) and the workspace package name
  (`ytmdesktop2`, used by `pnpm --filter`).
- **Why:** moving the profile would lose the owner's settings and sign-ins, and users never see the folder name.
- **Cost if wrong:** an odd folder name, which a migration can still change later.

## 2026-10-26: Our own video control bar; capture permissions refused
- **Probe (C2's first choice):** YTM builds `#movie_player` without YouTube's control bar.
  `.ytp-chrome-bottom`, the settings menu and every `.ytp-*-button` are absent, not hidden, so
  there is nothing to re-enable.
- **Decision:** one bar of our own on the player API (quality, captions, speed, loop, PiP, theater,
  full screen) and YouTube's keys, live only after a click on the video.
- **Permissions:** Electron granted every permission to every page, which let any page open the
  microphone or camera without a prompt. The output-device menu needs the "media" permission
  for device names, so main now:
  - allows device listing and speaker selection only for YouTube Music and the app's own pages,
  - refuses capture everywhere,
  - leaves other permissions at Electron's default.
- **Cost if wrong:** a future feature that needs the microphone (voice search) must add a
  narrow exception in `src/main/lib/mediaPermissions.ts`.

## 2026-10-26: Song mode pairs the found song with the playing queue row
- **Owner report:** Song mode showed the music video's thumbnail instead of the song's cover.
- **Cause:** without Premium, YouTube sends no song/video pairs ("counterparts"), so there was
  nothing to switch to.
- **Decision:**
  - Search YTM (`/search` with the Songs or Videos filter, through the page's own client) and match
    by title, artist, length (10 s or less apart) and version words (remix, live, cover…).
  - Turn the playing queue row into a song/video pair, the shape Premium accounts get, with a
    one-segment map, and let YTM switch between them itself.
  - The first switch carries `startTimeSeconds`; after that YTM maps the position.
- **Rejected:** `yt-navigate` to the found song (the plan's first idea). It plays the song at the
  right time, but YTM rebuilds "Up next" as a new radio for it, even with `hasPersistentPlaylistPanel`
  and the queue index. Measured on the bench.
- **Cost if wrong:** a wrong match plays a different recording. The strict threshold, the length
  check and the found version shown in the switch's tooltip limit that. If YouTube changes how
  pairs work, Song mode falls back to the cover over the video.

## 2026-10-26: One window surface, one "Background" setting
- **Owner report:** a black title bar, some areas darker than others, some blurred and some not, the
  browse page showing through the player, a hard-edged band on Home, and four toggles (Thumbnail
  Background, Blur, Glass, Themes) that seemed to do the same thing.
- **Causes:**
  - The three background stylesheets stacked, and their order depended on the toggle flipped last.
  - The title bar is our own view, outside the YouTube page, so the page styling never reached it.
  - The Default theme forces the browse page `visibility: visible !important`, which beat our hide.
  - Signed in, Home has its own hero image; we had removed the gradient that fades it.
- **Decision:**
  - One stylesheet, `chrome/surface.scss`, always injected after the theme. One setting,
    `themes.background`: "Song artwork" or "Plain dark". Full-page glass is dropped, because the
    artwork is already pre-blurred.
  - The artwork layer uses window coordinates (a 100vw square, shifted up 25vw). The title bar paints
    the same pre-blurred image (`shared/artwork/blur.ts`) with the same numbers, so there's no seam.
  - The browse page is hidden with `opacity`, which children can't override.
  - The Home hero is hidden in artwork mode, and YouTube's doubled dividers become one faint hairline.
- **Cost if wrong:** a theme can't restyle the window background; that's on purpose.

## 2026-10-26: Owner decisions D1–D6 (roadmap §11)
- **D1, GPL code may be ported.** The fork's license moves to GPL-3.0 with the first GPL port;
  those parts can't go upstream.
- **D2, opt-in "Import Google sign-in from Firefox"** (local only, confirmed each time).
- **D3, real pitch shift via a SoundTouch (LGPL) port.** Falls back to speed-linked pitch if
  unstable.
- **D4, Genius via the owner's token** (`VITE_GENIUS_TOKEN`), with keyless endpoints as a
  fallback.
- **D5, Last.fm via the owner's own API account.** Upstream's key is a private CI secret and
  isn't used. No ListenBrainz.
- **D6, signed-in tests use the owner's account,** imported into an isolated profile. They're
  read-only, and ad-block tests stay signed out.

## 2026-10-26: Faster tests (phase A)
- **Decision:** scenarios marked `reuse` share one app launch, with a reset between them; tests
  are tiered (unit / smoke / full / perf); builds are skipped when the inputs hash is unchanged.
- **Why:** each task's test loop took 5–20 min; smoke now takes about 1 min.
- **Cost if wrong:** state leaking between shared scenarios. That's why `reuse` is opt-in and a
  failure gets a fresh launch.

## 2026-10-26: Phase B review: fixed vs. deferred
- **Fixed:**
  - Sign-in pop-ups are allow-listed to Google/YouTube hosts, with no preload and a handler on
    children.
  - Pop-ups reload with the chosen identity.
  - The 10-minute timeout closes the window instead of orphaning it.
  - SameSite=None is only set with Secure.
  - Closing the Last.fm window right after approving finishes the connection instead of
    cancelling.
  - Last.fm links open in the browser.
  - There's no double YouTube reload after an import.
  - The close listener no longer leaks.
  - s18 checks the Cancel path, and s19 moved to the full tier.
- **Deferred to the backlog** (they don't block using the app):
  - centring the sign-in window on the main window,
  - a longer UA fallback list (ESR pinning),
  - a "sign-in is per app profile" note in Settings,
  - an s17 success-close check (music.youtube.com can't be mocked),
  - scrobble-sent and signature unit checks for Last.fm,
  - an explicit "Last.fm not configured" UI message,
  - the signed-in account smoke on the real account (manual owner check, D6).

## 2026-10-26: Sign-in that works the first time (phase B)
- **Google:**
  - **Causes:** the login window presented Firefox 92 (2021) on Windows, was modal and always
    on top, and sent Google's own pop-ups to the default browser.
  - **Decision:** a normal window with a current Firefox identity and Chrome as the alternative.
    Rejection is detected with a one-click retry, the working identity is remembered, pop-ups
    stay in-app, and there's an opt-in import from Firefox (D2).
- **Last.fm:**
  - **Causes:** the fork had no API key, and the approval came back through a `ytmd://` link
    another app could catch.
  - **Decision:** the owner's own key in `.env.local`, and an in-app approval window plus
    polling, with no callback.
- **Testing:** the real Google and Last.fm can't be automated. Mock servers and a fake Firefox
  profile cover the logic (`s17`–`s19`), and a real sign-in remains a manual owner check.

## 2026-10-26: Artwork background covers the whole window
- **Owner report:** the themed area was a rectangle that didn't match the side panel, top bar or
  player bar.
- **Decision:** one fixed `body::before` layer holds a pre-blurred 96 px copy of the artwork with
  a dark veil, and YouTube's chrome is made translucent. That means the side panel, top bar,
  player bar and player page, plus Home's `.background-gradient`.
  - The browse page is hidden while the player is open.
- **Fixes along the way:**
  - YouTube thumbnails' 4:3 letterbox bands are cropped (`track-theme.crop.ts`).
  - No `transform` on the layer: a composited, upscaled tiny image drew a seam at a GPU tile
    boundary.
  - The Default theme's `!important` on the player bar is overridden by a more specific rule.
- **Known limit:** some music videos have black bars burned into the video file (e.g. the 4:3
  test track is encoded at 640×360). No styling can remove those.

## 2026-10-26: Test what the app did, not what the page happens to show
- **What happened:** the glass test checked the page's computed style. YouTube opens music videos
  in Video mode, where its own styles override the glass layer, so the test was flaky. Also,
  `webContents.insertCSS` sheets don't appear in `document.styleSheets`.
- **Decision:** when a check depends on YouTube's changing page, ask our own code instead (here
  the theme service's injector) through `__YTMD_TEST__`.
- **Known limit:** glass doesn't show over Video mode.

## 2026-10-26: Re-apply layout after window state changes
- **What happened:** maximizing a frameless window on Windows can settle its content size after
  the `maximize` event, with no new `resize`, which left the YouTube view 2 px short.
- **Decision:** `applyLayout` runs again on `resized` and 50/250 ms after state changes.
  Re-applying the same bounds is a no-op.

## 2026-10-25: Hybrid architecture: "YouTube engine, our shell"
- **Decision:** the YouTube Music web page stays the engine for playback, sign-in and library;
  our own UI is added on top.
- **Why:** a native YouTube client (Metrolist-style) means chasing YouTube's cipher changes
  forever.
- **Cost if wrong:** some data stays hard to reach. The design doc §4 compares the options.

## 2026-10-25: The fork runs alongside the upstream app
- **Decision:** own app id (`com.ytmdesktop2.plus`), own profile folder (`ytmdesktop2-plus`),
  own link scheme (`ytmdplus://`), own exe name, and upstream auto-update off.
- **Why:** the owner's installed upstream app and profile must never be touched.

## 2026-10-25: Three-layer ad block
- **Decision:** three layers: the network (Ghostery lists, cosmetic filters off), response
  pruning at document start (`src/shared/adblock/prune.ts`), and a fallback skipper (mute + 16×
  + skip).
- **Why:** YouTube serves its own ads from the same servers as the music, so network blocking
  alone isn't enough.
- **Watch-history pings are allow-listed,** so history and recommendations keep working.

## 2026-10-25: Maintainer's background switches kept
- **Decision:** removing `disable-renderer-backgrounding` and its related switches saved no
  measurable CPU, so they stay as upstream set them.
- **Evidence:** spec §8.

## 2026-10-26: Audio engine attaches late and only to a running context
- **Decision:** the engine creates its `MediaElementSource` only when the first audio stage turns on, and only
  while its `AudioContext` runs. Main grants a user gesture when the context can't start alone.
- **Why:** a media element routed into Web Audio can't go back to its native output, and a suspended context
  would mute it. Users who never touch the audio lab keep the plain path.

## 2026-10-26: Pitch shift without an AudioWorklet (D3)
- **Decision:** ±6 semitones with a delay-line granular shifter built from standard nodes, not the SoundTouch
  worklet.
- **Why:** an AudioWorklet module would have to load inside YouTube Music's page, under its CSP and Trusted
  Types; standard nodes can't be blocked and cost little. SoundTouch stays as backlog row 67 if quality isn't
  enough. D3's fallback (speed-linked pitch) wasn't needed.

## 2026-10-26: Crossfade as fade out and fade in, not two overlapping players
- **Decision:** one fade gain on the engine; no second player.
- **Why:** Pear's overlap plays the next track through Howler from a stream URL deciphered in main: fragile,
  and it doubles the network. Row 44 keeps true overlap as a stretch goal.

## 2026-10-26: AutoEq is fetched by main
- **Decision:** main fetches and caches AutoEq files; the page only gets the parsed filters through settings.
- **Why:** the YouTube Music page's CSP governs what the page may fetch, and main can cache on disk.

## 2026-10-30: Game mode steps back instead of capping memory
- **Decision:** while another app is in front, lower our non-audio processes' priority; while hidden, decode the
  video at 144p and free Blink's caches. No heap limits.
- **Why:** a game competes for CPU and GPU time, which priority and decoding settle. A heap cap on the YouTube
  Music page would risk crashing playback.

## 2026-10-30: Now Playing, comments and queue come from YouTube Music (F1, F4, F5)
- **Decision:** no separate Now Playing view, comments client or queue panel. The title-bar pill opens YouTube
  Music's player page, which now has the artwork or video, the queue (drag to reorder), lyrics, comments and related.
- **Why:** building them again would duplicate what the page already does well and add a second view to keep in
  sync. Our parts (lyrics view, About panel, karaoke) plug into that page.

## 2026-10-30: Karaoke on Shift+K
- **Decision:** capital K (Shift+K) and a microphone button open karaoke; lowercase k stays play/pause.
- **Why:** YouTube's k is play/pause, and the video controls already use it.
