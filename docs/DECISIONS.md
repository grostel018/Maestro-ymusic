# Decision log

Short records of decisions that shape the code, so collaborators know **why**. Newest first.
Format: what we decided, why, what it costs if wrong. The full per-task record for phases 0–1 is
in `docs/superpowers/plans/2026-10-25-phase0-1-ledger.md`.

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
