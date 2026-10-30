# YTMDesktop2 Plus - Improvement Backlog

The ordered list of improvements still to make. Work top to bottom unless something is urgent. Seeded from phases 2-6 of docs/superpowers/specs/2026-10-25-desktop-music-overhaul-design.md; phases 0-1 are finished and recorded in the Done table.

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
| Tier 1 - Core features and daily use | 6 |
| Tier 2 - Expected features | 11 |
| Tier 3 - Valuable extras | 18 |
| Tier 4 - Nice to have | 6 |
| Tier 5 - Low value for now | 0 |
| **Total open** | **41** |

Done: 26. Next free ID: 82.

## Owner requests (2026-10-30)

| ID | Area | Request | Status |
|---|---|---|---|
| 68 | Lyrics | Optional glow in the song's color flowing through the current line's letters (pulses with the bass); color selectable (song, theme accent, custom) | done |
| 69 | Lyrics | Lyrics text size the user can change any time (setting and quick A−/A+ in the lyrics view) | done |
| 70 | Lyrics | At the start of a song the lyrics sit far down the panel; start near the top | done |
| 71 | Lyrics | When no provider has lyrics, show YouTube Music's own lyrics inside our view (same look and size), not the stock view | done |
| 72 | Settings | Reorganize the settings layout; the equalizer section is confusing | done |
| 73 | Player | Popup menus (sleep timer, speed, output, video bar) stay open when their button is clicked again; check every button | done |
| 74 | SponsorBlock | Skips happened where nothing was off-topic; easy undo and an obvious off switch; music-only category by default | done |
| 75 | Search | Search page: a black bar behind the result tabs and an odd search box layout | done (not reproduced; unverified) |
| 76 | Playback | Song mode still misses the song version of some music videos (test on the owner's real account, allowed 2026-10-30) | done |
| 77 | Release | Public repo for this fork: README, feature list, demo video or screenshots | todo |
| 78 | Release | Post on Reddit and forums for free download | todo |
| 79 | Security | Security audit of the app before publishing | todo |
| 80 | Docs | Easy user documentation | todo |
| 81 | Release | In-app update button: offer the new version from the fork's own releases when the app opens | todo |
| 82 | Lyrics | Estimated word fill sometimes runs ahead of or behind the singing (fixed pace for every song) | done: per-song pace |
| 83 | Lyrics | No way to correct lyrics that are a bit early or late; add a per-song timing nudge (−/+ 0.25 s) in the view and karaoke | done |
| 84 | Lyrics | Between two words no word is marked as sung, so the glow drops for a moment; keep the last sung word lit | done |
| 85 | Lyrics | Glow halo cut by a hard edge on the left of the lyrics panel | done |
| 86 | Lyrics | Line-synced lyrics only fill whole lines; fill word by word with estimated timing | done |
| 87 | Lyrics | LRCLib often answers 503 (busy); a miss was trusted and YouTube Music's text shown for good | done: retries |
| 88 | Karaoke | Karaoke lacked the glow pulse backdrop, song info, progress, playback controls and countdown dots | done |
| 89 | Karaoke | No A−/A+ text size in karaoke | done |
| 90 | Lyrics | Exact syllable timing for line-only lyrics would need speech alignment (Whisper-style); too heavy for now | backlog |
| 91 | Video mode | Some music videos show a black picture (E. SIGNALER remix, 2026-10-30); not reproduced yet | todo |

## Tier 0 - Make the core experience work

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|

## Tier 1 - Core features and daily use

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | 26 | Lyrics | Phase 4: Apple-style lyrics renderer with big lines, dimmed inactive lines and spring scrolling | 88 | L | todo |
| 2 | 23 | Now Playing | Phase 4: /youtube/now-playing route shown as a full-window WebContentsView over the YouTube view (opened by artwork, LCD or F11) | 85 | L | todo |
| 3 | 13 | Themes | Phase 3: theme document (JSON) with mode, palette, font, corner radius, background style and density | 78 | M | todo |
| 4 | 32 | Lyrics | Phase 4: relay from the page world to main to the Now Playing view carrying the resolved lyric document and playback position (about 30 Hz, stopped when hidden) | 78 | M | todo |
| 5 | 14 | Themes | Phase 3: compile the theme document to CSS variables for the YouTube page and Tailwind tokens for the React views | 76 | M | todo |
| 6 | 24 | Now Playing | Phase 4: layout with large artwork that shrinks on pause, title/artist, scrubber, transport, volume and lyrics/queue/video toggles | 74 | M | todo |

## Tier 2 - Expected features

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 7 | 27 | Lyrics | Phase 4: word-by-word fill with a soft glow when word timing exists, line-level otherwise | 70 | M | todo |
| 8 | 21 | Toolbar | Phase 3: Apple Music style toolbar with back/forward and search on the left, centered LCD now-playing pill, window controls on the right | 66 | L | todo |
| 9 | 18 | Themes | Phase 3: Settings > Appearance > Themes with palette grid, live preview and accent color picker | 64 | M | todo |
| 10 | 16 | Themes | Phase 3: presets (Apple Music light and dark, AMOLED Black, YouTube) | 62 | S | todo |
| 11 | 36 | Now Playing | Phase 4: detach the YouTube view while Now Playing is open so it stops painting but audio continues | 62 | S | todo |
| 12 | 15 | Themes | Phase 3: dynamic mode that takes colors from the current artwork with node-vibrant and cross-fades over 400 ms | 60 | M | todo |
| 13 | 33 | Now Playing | Phase 4: queue panel from the navigation service (queueList, queuePlay, queueClear, onQueue) | 58 | M | todo |
| 14 | 38 | Performance | Phase 4: perf scenario p8, Now Playing open with lyrics scrolling, frame time p95 <= 20 ms | 56 | S | todo |
| 15 | 4 | Video | Phase 2: captions auto-translate (on/off and language selection shipped in C2) | 55 | S | todo |
| 16 | 28 | Lyrics | Phase 4: tap a lyric line to seek | 54 | S | todo |
| 17 | 48 | Lyrics | Phase 6: local romanization for Japanese, Korean and Chinese lyrics, with a large dictionary downloaded on first use | 52 | L | todo |

## Tier 3 - Valuable extras

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 18 | 37 | Mini player | Phase 4: polish trayView into an always-on-top compact mini player with an artwork background | 50 | M | todo |
| 19 | 49 | Lyrics | Phase 6: lyrics translation through a pluggable provider, free endpoint by default, API key setting | 50 | M | todo |
| 20 | 22 | Toolbar | Phase 3: restyle YTM's bottom player bar to match the theme | 48 | M | todo |
| 21 | 34 | Now Playing | Phase 4: queue drag reorder, remove and play-next page commands against YTM's queue store | 48 | M | todo |
| 22 | 25 | Now Playing | Phase 4: animated mesh-gradient background (quarter-resolution WebGL, paused when hidden, static with reduce-motion) | 46 | M | todo |
| 23 | 20 | Themes | Phase 3: keep custom SCSS files (customFile) working on top of the theme | 45 | S | todo |
| 24 | 35 | Now Playing | Phase 4: video toggle in Now Playing that closes it, switches YTM to Video and shows the phase 2 controls | 42 | S | todo |
| 25 | 50 | Library | Phase 6: local playlists stored in userData, played through YTM by video ID | 42 | M | todo |
| 26 | 31 | Lyrics | Phase 4: slot for a translation/romanization line under each lyric line | 40 | S | todo |
| 27 | 55 | Bench | Signed-in bench scenarios on the throwaway Google account (ad-block runs while signed in) | 40 | M | todo |
| 28 | 11 | Video | Phase 2: setting 'Open new tracks as video when available' (default off) | 38 | S | todo |
| 29 | 52 | Library | Phase 6: optional offline downloads through yt-dlp (off by default) with a Downloaded library that plays local files | 38 | L | todo |
| 30 | 29 | Lyrics | Phase 4: background vocals smaller under their line and duet singers aligned left and right | 36 | M | todo |
| 31 | 51 | Library | Phase 6: import local playlists from YTM playlists, CSV, M3U and a Spotify export file | 36 | M | todo |
| 32 | 17 | Themes | Phase 3: about 16 extra palettes in the spirit of Metrolist's 19 | 34 | S | todo |
| 33 | 30 | Lyrics | Phase 4: three pulsing dots for instrumental breaks | 34 | S | todo |
| 34 | 6 | Video | Phase 2: stats panel (resolution, codec, dropped frames, buffer) | 32 | S | todo |
| 35 | 19 | Themes | Phase 3: theme import and export (.ytmdtheme.json) and duplicate-and-edit | 30 | S | todo |

## Tier 4 - Nice to have

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|
| 36 | 53 | Library | Phase 6: listening stats with top tracks and artists and time listened, from the existing track events | 26 | M | todo |
| 37 | 54 | Bench | Offer the bench, layout fixes and video controls upstream as separate PRs cut from master | 20 | M | todo |
| 38 | 44 | Audio | Phase 5: true overlapping crossfade with a second player (stretch goal) | 14 | L | todo |
| 39 | 56 | Performance | Reduce Home idle CPU (p1 measured 3.17%, budget 2.36%): most of it is YouTube Music's own page, so look at pausing off-screen animations and carousels | 14 | M | todo |
| 40 | 66 | Audio | Phase D follow-up: Butterchurn (Milkdrop) visualizer as a third style, lazy-loaded WebGL | 20 | M | todo |
| 41 | 67 | Audio | Phase D follow-up: SoundTouch AudioWorklet pitch shift if the delay-line shifter sounds too grainy | 15 | M | todo |

## Tier 5 - Low value for now

| Rank | ID | Area | Improvement | Weight | Effort | Status |
|---|---|---|---|---|---|---|

## Done

| ID | Improvement | Completed | Notes |
|---|---|---|---|
| 57 | Phase 0: Playwright e2e and perf bench (sNN / pNN scenarios, baseline file, VERIFICATION.md generator) | 2026-10-25 | 15 e2e scenarios and 8 perf scenarios; `pnpm test:e2e`, `pnpm test:perf`, `pnpm verify` |
| 58 | Phase 1: view layout follows window (setSize, maximize, fullscreen) | 2026-10-25 | p4 avg 20.8 frames / 97 ms to 1.4 frames / 1.85 ms (frame budget of 1 still missed: max 4 frames, about 0.4 frame at 200 Hz); p5 104 / 110 ms to 2 / 13 ms |
| 59 | Phase 1: cheap glass (pre-blurred artwork, no full-page backdrop-filter; themes.glass opt-in) | 2026-10-25 | s4, s4b; frame p95 unchanged at 5.1 ms because the display is about 200 Hz |
| 60 | Phase 1: Chromium rest/power hold (power-save blocker only while playing, GPU blocklist respected) | 2026-10-25 | s10, s11; backgrounding switches kept after measurement (no p6 gain from removing them) |
| 61 | Phase 1: layer 1 ad blocker, network blocking of ad and tracker requests | 2026-10-25 | s5 |
| 62 | Phase 1: layer 2 ad blocker, pruning ad payloads from YouTube responses | 2026-10-25 | s6 |
| 63 | Phase 1: layer 3 ad blocker, fallback skipper (16x mute) and Premium upsell hiding | 2026-10-25 | s7, s8 |
| 64 | Phase 1: ad block settings page with stats line and seeded-settings bench support | 2026-10-25 | s12, s13 |
| 65 | Phase C1b: Song mode finds the real song (and Video mode the music video) by search and switches to it in place | 2026-10-26 | s21, s22; queue and position kept, square album cover; no-match hint and square thumbnail |
| 1 | Phase 2: video-controls page-world plugin skeleton drawn over #movie_player when the Song/Video toggle is on Video, built on the YouTube player API | 2026-10-26 | C2 control bar over #movie_player (YTM has no YouTube control bar to re-enable); s23 |
| 2 | Phase 2: quality menu (Auto plus every available level, player.res preference as default) | 2026-10-26 | C2 quality menu, saved to player.res, position kept; s23 |
| 3 | Phase 2: speed menu 0.25-2x plus a custom value | 2026-10-26 | C2/C4 speed menu with presets, custom slider; s23, s25 |
| 5 | Phase 2: loop toggle | 2026-10-26 | C2 loop = YTM repeat-one; s23 |
| 7 | Phase 2: picture-in-picture button | 2026-10-26 | C2 picture-in-picture (i); s23 |
| 8 | Phase 2: theater button (fill the app window) | 2026-10-26 | C2 theater (t / Esc); s23 |
| 9 | Phase 2: fullscreen button that fills the monitor through the HTML-fullscreen path | 2026-10-26 | C2 fullscreen on #movie_player through the HTML-fullscreen path; s23 |
| 10 | Phase 2: YouTube keyboard shortcuts while the player is focused (k/space, j/l, arrows, comma/period frame step, < >, f, m, c, 0-9, i, t) | 2026-10-26 | C2 shortcuts live only after a click on the player; s23 |
| 12 | Phase 2: speed also applies in audio mode, with a 'keep pitch' toggle mapped to preservesPitch | 2026-10-26 | C4 player-bar speed button works in Song mode; keep pitch saved; s25 |
| 39 | Phase 5: lazy Web Audio graph on YTM's media element (source, normalization gain, 10-band EQ, fade gain, destination) bypassed when every feature is off | 2026-10-26 | D1 audio engine: one AudioContext, fixed ordered chain of 8 stages, attaches only when a stage is on; s26 (no silence over 200 ms while toggling) |
| 40 | Phase 5: 10-band equalizer (32 Hz-16 kHz) with Flat, Bass Boost, Vocal, Treble, Loudness, Acoustic and Electronic presets | 2026-10-26 | D2 10-band and parametric EQ, 13 presets, clipping guard, AutoEq headphone profiles; s27, s27b |
| 41 | Phase 5: custom EQ presets that can be saved, and a pre-amp control | 2026-10-26 | D2 user presets, preamp, import and export |
| 42 | Phase 5: loudness normalization from YouTube's per-track loudness value targeting -14 LUFS (decide merge with the volumeRatio plugin) | 2026-10-26 | D4 raises quiet tracks from YouTube loudnessDb (max +6 dB; YouTube already lowers loud ones), volumeRatio untouched; s28 |
| 43 | Phase 5: smooth transitions, fade out the last N seconds (1-12, default 5) and fade in the next track | 2026-10-26 | D5 fade out before the end and in on the next track (1-12 s, default off); s29 |
| 45 | Phase 5: skip silence, an analyser that jumps past more than 1.5 s below -50 dB mid-track or a silent tail | 2026-10-26 | D5 skip silence (-50 dB for 1.5 s; next track at the tail); unit tested |
| 46 | Phase 5: independent pitch shift of +-6 semitones with a SoundTouch AudioWorklet (optional, last in the phase) | 2026-10-26 | D6 +-6 semitones with a delay-line pitch shifter (no AudioWorklet); SoundTouch kept as row 67; s28 |
| 47 | Phase 5: sleep timer after N minutes or at the end of the current track, fading out over 10 s then pausing | 2026-10-26 | D5 player-bar moon button: minutes or end of track, 10 s fade then pause; s29 |

## Change log

- 2026-10-25: Backlog created with 55 items, seeded from the roadmap (phases 2-6).
- 2026-10-25: Phases 0-1 finished and measured; recorded as done rows 57-64. Added item 56 after p1 missed its budget.
- 2026-10-26: C1b (real song version in Song mode) done as row 65.
- 2026-10-26: Phase C2–C4 video controls, speed and output device done (rows 1, 2, 3, 5, 7, 8, 9, 10, 12); item 4 narrowed to auto-translate.
- 2026-10-26: Phase C closed (C5): perf p9 shows Song mode CPU 4.72% vs Video 5.01%.
- 2026-10-26: Phase D (audio engine and audio lab) done: rows 39, 40, 41, 42, 43, 45, 46, 47. Added 66 (Butterchurn) and 67 (SoundTouch).
- 2026-10-30: Game mode added. Phase E (themes, backgrounds, title bar), F (lyrics view, About panel, karaoke; F1/F4/F5 from YouTube Music) and G picks (SponsorBlock, stats) done; rows not yet moved to Done (audit pending).
