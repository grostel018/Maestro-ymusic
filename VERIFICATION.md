# YTMDesktop2 Plus - Verification Checklist

Checked on 2026-10-26. **11/29 verified.**

Every row is tied to evidence: an end-to-end scenario (`sNN`) or a perf scenario (`pNN`), run by `tests/e2e/run.ts` against the real built app. A row is ticked only when all of its evidence passed in the last run. Perf rows other than p7 mean "measured and recorded"; their numbers are in `tests/e2e/results/perf-*.json`, and a tick means "measured", not "within budget": budgets are judged in section 8 of the design spec. Regenerate with `pnpm verify` after each batch.

Suite: 11/11 passed

| # | Area | Check | Evidence | Result | Notes |
|---|---|---|---|---|---|
| 1 | Boot | The production build boots into music.youtube.com on an isolated profile | s1 | [ ] FAIL | s1 not run |
| 2 | Boot | Launched without --user-data-dir, settings, credential and auth stores land in the fork folder and the upstream folders stay untouched | s15 | [ ] FAIL | s15 not run |
| 3 | Window layout | Toolbar and YouTube views match the window after setSize, maximize and unmaximize | s2 | [ ] FAIL | s2 not run |
| 4 | Window layout | YouTube Music's HTML fullscreen fills the screen without the toolbar and restores on exit | s3 | [ ] FAIL | s3 not run |
| 5 | Window layout | HTML fullscreen started from a maximized window returns to maximized | s3b | [ ] FAIL | s3b not run |
| 6 | Window layout | Quitting during HTML fullscreen saves the pre-fullscreen state: a maximized window relaunches maximized, a 1200x700 one at 1200x700 | s14, s14b | [ ] FAIL | s14 not run, s14b not run |
| 7 | Themes / performance | The player page uses a pre-blurred artwork with no full-page backdrop-filter or blur() by default | s4 | [ ] FAIL | s4 not run |
| 8 | Themes / performance | themes.glass restores the full-page backdrop-filter | s4b | [ ] FAIL | s4b not run |
| 9 | Performance | Home idle CPU over 10 s is measured and recorded | p1 | [x] |  |
| 10 | Performance | Frame times while playing at 1500x800 are measured and recorded | p2 | [x] |  |
| 11 | Performance | Frame times while playing maximized are measured and recorded | p3 | [x] |  |
| 12 | Performance | Frame times while playing in YouTube Music's HTML fullscreen are measured and recorded | p3b | [x] |  |
| 13 | Performance | Resize sweep from 1000 to 1600 px is measured and the views follow the window | p4 | [x] |  |
| 14 | Performance | Views follow the window after entering and leaving fullscreen | p5 | [x] |  |
| 15 | Background / power | Minimized: the toolbar view reports hidden and YouTube playback keeps advancing | s9 | [ ] FAIL | s9 not run |
| 16 | Background / power | The tray view keeps background throttling on and still shows the current track, including a change made while it was hidden | s16 | [ ] FAIL | s16 not run |
| 17 | Background / power | A power-save blocker is held only while music plays | s10 | [ ] FAIL | s10 not run |
| 18 | Background / power | ignore-gpu-blocklist is off by default and the backgrounding switches match the measured decision | s11 | [ ] FAIL | s11 not run |
| 19 | Performance | CPU while paused and minimized for 60 s is measured and recorded | p6 | [x] |  |
| 20 | Playback | Playback keeps advancing while the window is minimized (at least 100 s in 120 s) | p7 | [x] |  |
| 21 | Bench | Settings seeded through launchApp survive startup migrations | s13 | [ ] FAIL | s13 not run |
| 22 | Ad block | Ad and tracker requests fail with ERR_BLOCKED_BY_CLIENT, every blocked URL is logged, watch-history pings are not blocked, the count rises and playback advances | s5 | [ ] FAIL | s5 not run |
| 23 | Ad block | Ad payloads are pruned from YouTube's responses: no ad keys in the player response and no ad shows for 60 s | s6 | [ ] FAIL | s6 not run |
| 24 | Ad block | An ad-showing player is muted at 16x within 1 s and both are restored when the ad ends, counted as skipped | s7 | [ ] FAIL | s7 not run |
| 25 | Ad block | Premium upsell elements are hidden while hideUpsells is on and shown when it is off | s8 | [ ] FAIL | s8 not run |
| 26 | Ad block | The ad block settings page shows the five switches with their saved values, a blocked-count line, and restart notes only where a restart is needed | s12 | [ ] FAIL | s12 not run |
| 27 | Sign-in | The Google sign-in window is a normal window (not modal, not always on top, resizable), detects Google's browser rejection, and retries with the other browser identity | s17 | [x] |  |
| 28 | Sign-in | Import sign-in from Firefox reads the profile Firefox really uses and copies only its youtube.com / google.com cookies into the app | s18 | [x] |  |
| 29 | Sign-in | Last.fm connects through an in-app approval window with one token (no sign-in loop) and stays connected after a restart | s19 | [x] |  |
