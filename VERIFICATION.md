# YTMDesktop2 Plus - Verification Checklist

Checked on 2026-10-25. **23/23 verified.**

Every row is tied to evidence: an end-to-end scenario (`sNN`) or a perf scenario (`pNN`), run by `tests/e2e/run.ts` against the real built app. A row is ticked only when all of its evidence passed in the last run. Perf rows other than p7 mean "measured and recorded"; their numbers are in `tests/e2e/results/perf-*.json`. Regenerate with `pnpm verify` after each batch.

Suite: 23/23 passed

| # | Area | Check | Evidence | Result | Notes |
|---|---|---|---|---|---|
| 1 | Boot | The production build boots into music.youtube.com on an isolated profile | s1 | [x] |  |
| 2 | Window layout | Toolbar and YouTube views match the window after setSize, maximize and unmaximize | s2 | [x] |  |
| 3 | Window layout | YouTube Music's HTML fullscreen fills the screen without the toolbar and restores on exit | s3 | [x] |  |
| 4 | Window layout | HTML fullscreen started from a maximized window returns to maximized | s3b | [x] |  |
| 5 | Themes / performance | The player page uses a pre-blurred artwork with no full-page backdrop-filter or blur() by default | s4 | [x] |  |
| 6 | Themes / performance | themes.glass restores the full-page backdrop-filter | s4b | [x] |  |
| 7 | Performance | Home idle CPU over 10 s is measured and recorded | p1 | [x] |  |
| 8 | Performance | Frame times while playing at 1500x800 are measured and recorded | p2 | [x] |  |
| 9 | Performance | Frame times while playing maximized are measured and recorded | p3 | [x] |  |
| 10 | Performance | Frame times while playing in YouTube Music's HTML fullscreen are measured and recorded | p3b | [x] |  |
| 11 | Performance | Resize sweep from 1000 to 1600 px is measured and the views follow the window | p4 | [x] |  |
| 12 | Performance | Views follow the window after entering and leaving fullscreen | p5 | [x] |  |
| 13 | Background / power | Minimized: the toolbar view reports hidden and YouTube playback keeps advancing | s9 | [x] |  |
| 14 | Background / power | A power-save blocker is held only while music plays | s10 | [x] |  |
| 15 | Background / power | ignore-gpu-blocklist is off by default and the backgrounding switches match the measured decision | s11 | [x] |  |
| 16 | Performance | CPU while paused and minimized for 60 s is measured and recorded | p6 | [x] |  |
| 17 | Playback | Playback keeps advancing while the window is minimized (at least 100 s in 120 s) | p7 | [x] |  |
| 18 | Bench | Settings seeded through launchApp survive startup migrations | s13 | [x] |  |
| 19 | Ad block | Ad and tracker requests fail with ERR_BLOCKED_BY_CLIENT, the blocked count rises and playback advances | s5 | [x] |  |
| 20 | Ad block | Ad payloads are pruned from YouTube's responses: no ad keys in the player response and no ad shows for 60 s | s6 | [x] |  |
| 21 | Ad block | An ad-showing player is muted at 16x within 1 s and both are restored when the ad ends, counted as skipped | s7 | [x] |  |
| 22 | Ad block | Premium upsell elements are hidden while hideUpsells is on and shown when it is off | s8 | [x] |  |
| 23 | Ad block | The ad block settings page shows the five switches with their saved values and a blocked-count line | s12 | [x] |  |
