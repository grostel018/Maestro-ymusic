# Reuse register

This fork reuses proven open-source work instead of rebuilding it (roadmap §1.1). This file lists
**every source we take from**, its license, and **every file we ported**, so attribution and
license duties stay clear.

## Rules

1. **Look here first.** Before building a feature, check the sources below and the roadmap's
   reuse map (§3).
2. **Acceptable sources:**
   - projects with ≥ 1.5k GitHub stars,
   - libraries shipped by such a project,
   - or public data APIs.
3. **Reference clones** live **outside** the repo in `..\reference\<repo>`.
   - They're read-only and never run.
   - Pin the commit in the table below.
4. **Every ported file starts with:**
   ```ts
   // Ported from <owner/repo>@<sha>:<path> (<license>) — <what changed>
   ```
5. **Licenses:**
   - **MIT / Unlicense / MPL-2.0:** port freely and keep the notice.
   - **GPL-3.0 is allowed** (owner decision D1, 2026-10-26).
     - The **first** GPL port also switches the fork's `LICENSE` to GPL-3.0 and updates this
       file and the README, in the same commit.
     - Parts containing GPL code can't be sent upstream (Venipa/ytmdesktop2 is CC0).
   - **LGPL** (SoundTouch, decision D3) is compatible with that.

## Sources

| Source | ★ (2026-10-25) | License | Pinned commit | Used for |
|---|---|---|---|---|
| [pear-devs/pear-desktop](https://github.com/pear-devs/pear-desktop) | 33.9k | MIT | `7c55260` (clone in `..\reference\pear-desktop`) | Plugins: output device, crossfade, skip silences, ambient mode, video toggle, quality, captions, speed, picture-in-picture, visualizer, listen together, synced lyrics, Last.fm auth, album color, compressor, precise volume, downloader, SponsorBlock |
| [ghostery/adblocker](https://github.com/ghostery/adblocker) | 1.0k | MPL-2.0 | npm `@ghostery/adblocker-electron@2.20.1` | Network ad blocking (in use) |
| [jaakkopasanen/AutoEq](https://github.com/jaakkopasanen/AutoEq) | 16.4k | MIT | — | Headphone EQ profiles (phase D) |
| [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) | 5.4k | MIT | — | Comments, metadata (phase F) |
| [peers/peerjs](https://github.com/peers/peerjs) | 13.5k | MIT | — | Listen together (phase G) |
| [jberg/butterchurn](https://github.com/jberg/butterchurn) | 2.0k | MIT | — | Visualizer (phase D) |
| [hexenq/kuroshiro](https://github.com/hexenq/kuroshiro) | 1.0k (shipped by Pear) | MIT | — | Japanese romaji (phase F) |
| [fast-average-color](https://github.com/fast-average-color/fast-average-color) | 1.5k | MIT | — | Dominant color (phase E) |
| [spicetify/spicetify-themes](https://github.com/spicetify/spicetify-themes) | 6.1k | MIT | — | Theme palettes (phase E) |
| [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | 202k | Unlicense | — | Downloads, Firefox cookie-import approach (phases B, G) |
| [MetrolistGroup/Metrolist](https://github.com/MetrolistGroup/Metrolist) | 13.8k | GPL-3.0 | — | Feature ideas, palettes, metroserver protocol |
| [better-lyrics/better-lyrics](https://github.com/better-lyrics/better-lyrics) | 1.0k | GPL-3.0 | — | Lyrics service (in use as a provider) |
| [TeamNewPipe/NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) | 2.0k | GPL-3.0 | — | Comments paging ideas |
| [ajayyy/SponsorBlock](https://github.com/ajayyy/SponsorBlock) | 14.0k | GPL-3.0 | — | Public segment API (via the Pear port) |

## Ported files

| Our file | From | License | What changed |
|---|---|---|---|
| `src/main/trpc/routers/lastfm/service.ts` (`openAuthWindow`) | Approach of pear-desktop@7c55260:`src/plugins/scrobbler/services/lastfm.ts` (`authenticate`) | MIT | Pattern only, not code: in-app approval window instead of browser + callback; we kept our existing client and its polling |
| `src/main/auth/firefoxCookies.ts` | Approach of yt-dlp `--cookies-from-browser` (Firefox: copy `cookies.sqlite`, read `moz_cookies`) | Unlicense | Written for Node's built-in SQLite, YouTube/Google cookies only, Electron cookie mapping |
