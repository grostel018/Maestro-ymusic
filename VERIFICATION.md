# YTMDesktop2 Plus - Verification Checklist

Checked on 2026-10-25. **8/9 verified.**

Every row is tied to evidence: an end-to-end scenario (`sNN`) or a perf scenario (`pNN`), run by `tests/e2e/run.ts` against the real built app. A row is ticked only when all of its evidence passed in the last run. Perf rows other than p7 mean "measured and recorded"; their numbers are in `tests/e2e/results/perf-*.json`. Regenerate with `pnpm verify` after each batch.

Suite: 8/9 passed

| # | Area | Check | Evidence | Result | Notes |
|---|---|---|---|---|---|
| 1 | Boot | The production build boots into music.youtube.com on an isolated profile | s1 | [x] |  |
| 2 | Performance | Home idle CPU over 10 s is measured and recorded | p1 | [x] |  |
| 3 | Performance | Frame times while playing at 1500x800 are measured and recorded | p2 | [x] |  |
| 4 | Performance | Frame times while playing maximized are measured and recorded | p3 | [x] |  |
| 5 | Performance | Frame times while playing in YouTube Music's HTML fullscreen are measured and recorded | p3b | [x] |  |
| 6 | Performance | Resize sweep from 1000 to 1600 px is measured and the views follow the window | p4 | [x] |  |
| 7 | Performance | Views follow the window after entering and leaving fullscreen | p5 | [x] |  |
| 8 | Performance | CPU while paused and minimized for 60 s is measured and recorded | p6 | [x] |  |
| 9 | Playback | Playback keeps advancing while the window is minimized (at least 100 s in 120 s) | p7 | [ ] FAIL | p7 failed |
