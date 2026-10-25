# YTMDesktop2 Plus - Improvement Backlog

The ordered list of improvements still to make. Work top to bottom unless something is urgent. Seeded from phases 2-6 of docs/superpowers/specs/2026-10-25-desktop-music-overhaul-design.md; phases 0-1 are tracked by their implementation plan.

## How this file is maintained

- **When an item is finished and verified:** move its row to the *Done* table at the bottom, with the date and a short note. Do not renumber anything.
- **When work starts on an item:** set its Status to `in progress`.
- **When a new idea comes up:** give it the next free ID (see *Next free ID* below), a weight and an effort, and insert it into the right tier by weight.
- **IDs never change.** Rank is just the row's position; it shifts as items are added or completed.
- **Weight (0-100):** how much the item improves everyday listening for a single Windows user on their own YouTube Music account, marked down for effort and risk. Tier is decided by weight: 89+ Tier 0, 72-88 Tier 1, 51-71 Tier 2, 29-50 Tier 3, 10-28 Tier 4, below 10 Tier 5.
- **Effort:** S = hours, M = a day or two, L = a week or more.
- **Status:** `todo`, `in progress`, `blocked` (say why in the row).

## Summary

| Tier | Open items |
|---|---|
| Tier 0 - Make the core experience work | 0 |
| Tier 1 - Core features and daily use | 8 |
| Tier 2 - Expected features | 18 |
| Tier 3 - Valuable extras | 25 |
| Tier 4 - Nice to have | 4 |
| Tier 5 - Low value for now | 0 |
| **Total open** | **55** |

Done: 0. Next free ID: 56.

## Tier 0 - Make the core experience work

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|

## Tier 1 - Core features and daily use

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | 26 | Lyrics | Phase 4: Apple-style lyrics renderer with big lines, dimmed inactive lines and spring scrolling | 88 | L | todo |
| 2 | 23 | Now Playing | Phase 4: /youtube/now-playing route shown as a full-window WebContentsView over the YouTube view (opened by artwork, LCD or F11) | 85 | L | todo |
| 3 | 1 | Video | Phase 2: video-controls page-world plugin skeleton drawn over #movie_player when the Song/Video toggle is on Video, built on the YouTube player API | 80 | M | todo |
| 4 | 13 | Themes | Phase 3: theme document (JSON) with mode, palette, font, corner radius, background style and density | 78 | M | todo |
| 5 | 32 | Lyrics | Phase 4: relay from the page world to main to the Now Playing view carrying the resolved lyric document and playback position (about 30 Hz, stopped when hidden) | 78 | M | todo |
| 6 | 14 | Themes | Phase 3: compile the theme document to CSS variables for the YouTube page and Tailwind tokens for the React views | 76 | M | todo |
| 7 | 24 | Now Playing | Phase 4: layout with large artwork that shrinks on pause, title/artist, scrubber, transport, volume and lyrics/queue/video toggles | 74 | M | todo |
| 8 | 2 | Video | Phase 2: quality menu (Auto plus every available level, player.res preference as default) | 72 | S | todo |

## Tier 2 - Expected features

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 9 | 27 | Lyrics | Phase 4: word-by-word fill with a soft glow when word timing exists, line-level otherwise | 70 | M | todo |
| 10 | 39 | Audio | Phase 5: lazy Web Audio graph on YTM's media element (source, normalization gain, 10-band EQ, fade gain, destination) bypassed when every feature is off | 68 | M | todo |
| 11 | 9 | Video | Phase 2: fullscreen button that fills the monitor through the HTML-fullscreen path | 66 | S | todo |
| 12 | 21 | Toolbar | Phase 3: Apple Music style toolbar with back/forward and search on the left, centered LCD now-playing pill, window controls on the right | 66 | L | todo |
| 13 | 18 | Themes | Phase 3: Settings > Appearance > Themes with palette grid, live preview and accent color picker | 64 | M | todo |
| 14 | 40 | Audio | Phase 5: 10-band equalizer (32 Hz-16 kHz) with Flat, Bass Boost, Vocal, Treble, Loudness, Acoustic and Electronic presets | 64 | M | todo |
| 15 | 16 | Themes | Phase 3: presets (Apple Music light and dark, AMOLED Black, YouTube) | 62 | S | todo |
| 16 | 36 | Now Playing | Phase 4: detach the YouTube view while Now Playing is open so it stops painting but audio continues | 62 | S | todo |
| 17 | 3 | Video | Phase 2: speed menu 0.25-2x plus a custom value | 60 | S | todo |
| 18 | 15 | Themes | Phase 3: dynamic mode that takes colors from the current artwork with node-vibrant and cross-fades over 400 ms | 60 | M | todo |
| 19 | 10 | Video | Phase 2: YouTube keyboard shortcuts while the player is focused (k/space, j/l, arrows, comma/period frame step, < >, f, m, c, 0-9, i, t) | 58 | M | todo |
| 20 | 33 | Now Playing | Phase 4: queue panel from the navigation service (queueList, queuePlay, queueClear, onQueue) | 58 | M | todo |
| 21 | 38 | Performance | Phase 4: perf scenario p8, Now Playing open with lyrics scrolling, frame time p95 <= 20 ms | 56 | S | todo |
| 22 | 4 | Video | Phase 2: captions menu (on/off, language, auto-translate) | 55 | S | todo |
| 23 | 28 | Lyrics | Phase 4: tap a lyric line to seek | 54 | S | todo |
| 24 | 7 | Video | Phase 2: picture-in-picture button | 52 | S | todo |
| 25 | 42 | Audio | Phase 5: loudness normalization from YouTube's per-track loudness value targeting -14 LUFS (decide merge with the volumeRatio plugin) | 52 | M | todo |
| 26 | 48 | Lyrics | Phase 6: local romanization for Japanese, Korean and Chinese lyrics, with a large dictionary downloaded on first use | 52 | L | todo |

## Tier 3 - Valuable extras

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 27 | 8 | Video | Phase 2: theater button (fill the app window) | 50 | S | todo |
| 28 | 37 | Mini player | Phase 4: polish trayView into an always-on-top compact mini player with an artwork background | 50 | M | todo |
| 29 | 49 | Lyrics | Phase 6: lyrics translation through a pluggable provider, free endpoint by default, API key setting | 50 | M | todo |
| 30 | 22 | Toolbar | Phase 3: restyle YTM's bottom player bar to match the theme | 48 | M | todo |
| 31 | 34 | Now Playing | Phase 4: queue drag reorder, remove and play-next page commands against YTM's queue store | 48 | M | todo |
| 32 | 47 | Audio | Phase 5: sleep timer after N minutes or at the end of the current track, fading out over 10 s then pausing | 48 | S | todo |
| 33 | 25 | Now Playing | Phase 4: animated mesh-gradient background (quarter-resolution WebGL, paused when hidden, static with reduce-motion) | 46 | M | todo |
| 34 | 43 | Audio | Phase 5: smooth transitions, fade out the last N seconds (1-12, default 5) and fade in the next track | 46 | M | todo |
| 35 | 20 | Themes | Phase 3: keep custom SCSS files (customFile) working on top of the theme | 45 | S | todo |
| 36 | 12 | Video | Phase 2: speed also applies in audio mode, with a 'keep pitch' toggle mapped to preservesPitch | 44 | S | todo |
| 37 | 35 | Now Playing | Phase 4: video toggle in Now Playing that closes it, switches YTM to Video and shows the phase 2 controls | 42 | S | todo |
| 38 | 50 | Library | Phase 6: local playlists stored in userData, played through YTM by video ID | 42 | M | todo |
| 39 | 5 | Video | Phase 2: loop toggle | 40 | S | todo |
| 40 | 31 | Lyrics | Phase 4: slot for a translation/romanization line under each lyric line | 40 | S | todo |
| 41 | 55 | Bench | Signed-in bench scenarios on the throwaway Google account (ad-block runs while signed in) | 40 | M | todo |
| 42 | 11 | Video | Phase 2: setting 'Open new tracks as video when available' (default off) | 38 | S | todo |
| 43 | 52 | Library | Phase 6: optional offline downloads through yt-dlp (off by default) with a Downloaded library that plays local files | 38 | L | todo |
| 44 | 29 | Lyrics | Phase 4: background vocals smaller under their line and duet singers aligned left and right | 36 | M | todo |
| 45 | 51 | Library | Phase 6: import local playlists from YTM playlists, CSV, M3U and a Spotify export file | 36 | M | todo |
| 46 | 17 | Themes | Phase 3: about 16 extra palettes in the spirit of Metrolist's 19 | 34 | S | todo |
| 47 | 30 | Lyrics | Phase 4: three pulsing dots for instrumental breaks | 34 | S | todo |
| 48 | 45 | Audio | Phase 5: skip silence, an analyser that jumps past more than 1.5 s below -50 dB mid-track or a silent tail | 33 | M | todo |
| 49 | 6 | Video | Phase 2: stats panel (resolution, codec, dropped frames, buffer) | 32 | S | todo |
| 50 | 19 | Themes | Phase 3: theme import and export (.ytmdtheme.json) and duplicate-and-edit | 30 | S | todo |
| 51 | 41 | Audio | Phase 5: custom EQ presets that can be saved, and a pre-amp control | 30 | S | todo |

## Tier 4 - Nice to have

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 52 | 53 | Library | Phase 6: listening stats with top tracks and artists and time listened, from the existing track events | 26 | M | todo |
| 53 | 54 | Bench | Offer the bench, layout fixes and video controls upstream as separate PRs cut from master | 20 | M | todo |
| 54 | 44 | Audio | Phase 5: true overlapping crossfade with a second player (stretch goal) | 14 | L | todo |
| 55 | 46 | Audio | Phase 5: independent pitch shift of +-6 semitones with a SoundTouch AudioWorklet (optional, last in the phase) | 12 | M | todo |

## Tier 5 - Low value for now

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|

## Done

| ID | Improvement | Completed | Notes |
|---|---|---|---|

## Change log

- 2026-10-25: Backlog created with 55 items, seeded from the roadmap (phases 2-6).
