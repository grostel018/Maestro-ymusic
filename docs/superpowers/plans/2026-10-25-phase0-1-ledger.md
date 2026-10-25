# SDD ledger — plan: docs/superpowers/plans/2026-10-25-phase0-1-test-bench-smooth-adfree.md
Spec: docs/superpowers/specs/2026-10-25-desktop-music-overhaul-design.md
Branch: feature/desktop-overhaul. MERGE_BASE (branch start) = ec7f52d. Docs commit a2e20b5.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 vs T2 | resolveUserDataDir null on --user-data-dir / s1 asserts userData==profileDir | consistent |
| T1 vs T2 | app.autoupdate default=FORK.updatesEnabled / profile seeds autoupdate false | consistent |
| T2 vs T3 | TestApp, CdpSession, waitFor / perf.ts adds play() | consistent |
| T3 vs T5 | baseline must be taken before T5 | order OK (T3 < T5) |
| T5 vs T7 | both edit view.ts (lockSize option / backgroundThrottling) + windowManager (layout / devtools gate) | sequential, no conflict; line refs are hints |
| T5 vs T10 | T10 cites windowManager.ts:174, shifts after T5 | line numbers are hints only |
| T6, T7, T8 | each appends a migration hook | append-only, order T6<T7<T8 |
| T4 vs T5–T12 | T4 says seed CHECKS for scenarios of Tasks 2–12, which don't exist yet | CONFLICT -> ruling 1 |
| T9 vs T11 | T9 stats().session; T11 emits adblock:skipped "counted by AdblockProvider" but T9 has no listener | GAP -> ruling 2 |
| T7 vs T2 | s10 needs isHeld exposed via startup provider through __YTMD_TEST__ | consistent |
| T12 vs T2 | s12 opens settings window via __YTMD_TEST__ | implementer finds the settings-window opener |
| Global: generated d.ts | builds in every task regenerate services.generated.d.ts | ruling 3 |
| T2 (network) | signed-out first load may hit consent.youtube.com | ruling 4 |
| T1 self | test "never ends in ytmdesktop2" vs dev path ytmdesktop2-dev | consistent (ends -dev) |
| T3 self | p3b added; Step 6 baseline before T5 | consistent |
| T7 self | Step 1 test expects switches removed; Step 3b may restore them | consistent (3b updates test) |
| Others self | tests vs code vs files | consistent |

Ruling: T4 seeds CHECKS only for scenarios that exist at T4 (s1, p1–p7); every later task adds its own scenario rows to tests/e2e/checks.ts — plan text can't seed rows for unwritten scenarios — cost if wrong: none, rows land with their scenarios.
Ruling: T11 also edits adblock/service.ts to count the page event adblock:skipped into stats().session — T11's interface says the provider counts it but T9 never listens — cost if wrong: one extra file in T11.
Ruling: every task restores services.generated.d.ts (git checkout) before committing except T9, which commits it — Global Constraint — cost if wrong: noisy diffs.
Ruling: the bench handles consent.youtube.com by choosing "Reject all" (privacy-preserving default) before waiting for music.youtube.com — needed for signed-out runs in consent regions — cost if wrong: s1 flakes until fixed.

## Progress
Task 1: dispatched (BASE a2e20b5, implementer a91c8105af0d9f016, sonnet)
Task 1: implemented 3f0c97e (DONE_WITH_CONCERNS: UI copy still says ytmd://, flatpak ids unchanged); review dispatched (sonnet)
Task 1: review -> Needs fixes (1 Important: LINUX_DESKTOP_ID still upstream id). Fix round 1 sent to implementer. FIX_BASE 3f0c97e
Task 1: minor (deferred): userDataPath.test.ts "C:\tmp\p" unescaped (\t tab) — should be C:\tmp\p
Task 1: minor (deferred): stale ytmd:// in ytmdProtocol.ts comments and settings UI copy
Task 1: minor (deferred): flatpak/metainfo ids + extraMetadata.name still upstream (flatpak target only)
Task 1: ⚠️ resolved — preload/generated/ytmd-world0-host.js is untracked build output, regenerated each build
Task 1: fix round 1/5 (1 addressed, 0 open; commits 3f0c97e..777dc6a)
Task 1: complete (commits a2e20b5..777dc6a, review clean)
Task 1: minor (deferred): metainfo xml id still net.venipa.ytmdesktop (electron-builder.yml:136-137)
Task 2: dispatched (BASE 777dc6a, opus)
Task 2: implemented 6d2bfcf (DONE; GPU: RTX 3060 Ti + Microsoft Basic Render Driver); review dispatched
Task 2: complete (commits 777dc6a..6d2bfcf, review clean)
Task 2: ⚠️ resolved — seeded keys app.autostart/autoupdate/enableStatisticsAndErrorTracing/getstarted exist in defaultSettings; store file is app-settings.yml
Task 2: minor (deferred): run.ts unknown id filter -> 0/0 passed exit 0 (false green)
Task 2: minor (deferred): no port preflight for 9361/9362 (stale app answers)
Task 2: minor (deferred): no proc.on("error") in lib/app.ts spawn
Task 2: minor (deferred): consent match English-only; timeout msg doesn't mention consent
Task 2: minor (deferred): top-level errors not teed to last-suite.log; launch failure doesn't point at electron-N.log
Task 2: minor (deferred): cdp connect never settles if ws closes before open
Ruling: Task 3 perf JSON also records GPU feature status (app.getGPUFeatureStatus()) — bench saw "Microsoft Basic Render Driver" next to the RTX 3060 Ti, so software rendering is a lag suspect the baseline must expose — cost if wrong: one extra field.
Task 3: dispatched (BASE 6d2bfcf, sonnet)
Task 3: implemented 1919d5e. BASELINE: p1 idle 3.37% CPU; p2/p3/p3b p95 5.1ms (5ms constant frames, 200Hz?); p4 view follows window ~97ms avg (~21 frames), max 104; p5 104/110ms; p6 0.28%; p7 FAIL 49.39s/120s minimized playing. GPU fully hw-accelerated.
Ruling: stats percentile uses floor(p*n/100) index so the brief's own test (p95=30) holds — brief's test data defines the method — cost if wrong: p95 reads one rank high.
Task 3: review dispatched
Task 3: complete (commits 6d2bfcf..1919d5e, review clean)
Task 3: minor (deferred): p4 step 0 is a no-op resize counted in averages (avg slightly understated)
Task 3: minor (deferred): 200Hz constant 5ms frames make p95/dropped blind to jank; record refresh rate / long tasks
Task 3: minor (deferred): stats.test only brief cases (no p100 clamp, single element, 25ms boundary)
Task 3: minor (deferred): perf.ts computes runStamp at import even in non-perf runs
Task 3: minor (deferred): baseline is a single run; Task 13 must allow for noise
Task 4: dispatched (BASE 1919d5e, sonnet)
Task 4: implemented 30333d1 (perf runs now log to last-perf.log; verify reads both); review dispatched
Task 4: complete (commits 1919d5e..30333d1, review clean)
Task 4: minor (deferred): verify.ts merges logs without freshness check; header date is generation date
Task 4: minor (deferred): "Suite: p/t" silently partial when a log is missing
Task 4: minor (deferred): failure notes lack the FAIL error text
Ruling: perf rows p1–p6 tick on "measured"; budget pass/fail is judged in Task 13 against spec §8, as the plan says — cost if wrong: checklist overstates perf until Task 13.
Task 5: dispatched (BASE 30333d1, opus)
Task 5: implemented 1bdd59e — p4 97.45ms->1.95ms avg, p5 104/110ms->4/10ms; s1 s2 s3 s3b pass; review dispatched
Task 5: complete (commits 30333d1..1bdd59e, review clean)
Task 5: ⚠️ resolved — TOOLBAR_HEIGHT 40 in scenarios matches uiZoom.ts:9; macOS/Linux restore order untested (Windows-only target per spec)
Task 5: minor (deferred): leaving window fullscreen (F11) during HTML fullscreen leaves toolbar hidden until page exits fullscreen
Task 5: minor (deferred): duplicated TOOLBAR_HEIGHT in scenarios/layout.ts; layout.test non-null assertion
Task 5: minor (deferred): bench prints MODULE_TYPELESS_PACKAGE_JSON warning when importing src/main/windows/layout.ts
Task 6: dispatched (BASE 1bdd59e, sonnet)
Task 6: implemented 42423f3 (DONE_WITH_CONCERNS: seeded app-settings.yml gets rewritten by old migrations since no store version; scenarios set settings at runtime instead; added saturate/brightness to canvas filter); review dispatched
Task 6: complete (commits 1bdd59e..42423f3, review clean)
Task 6: minor (deferred): s4 doesn't exercise default glass=false or the migration hook (no unit test for hook)
Task 6: minor (deferred): blurred thumbnail fetched every track even when thumbnailBackground off; previous blur shown until new ready
Task 6: minor (deferred): canvas filter adds saturate(120%) brightness(1.15) beyond brief (keeps old look)
Ruling: seeded app-settings.yml has no electron-conf migration version, so legacy migrations rewrite seeded values; Task 8 also fixes tests/e2e/lib/profile.ts to write the store's current migration version so launch.settings survive — Task 11/12 scenarios depend on seeded settings — cost if wrong: scenarios keep needing runtime-set settings.
Task 7: dispatched (BASE 42423f3, opus) — includes p7 baseline failure (49s/120s minimized)
Task 7: implemented 40310aa — Step 3b: switches KEPT (p6 0.26 vs 0.25%, no >=30% gain); p7 passes 120/120s; p7 baseline failure was measurement error (pre-roll ads in same <video>), bench fixed; review dispatched
Task 7: complete (commits 42423f3..40310aa, review clean)
Task 7: minor (deferred): p7 can pass on ad time alone (adS recorded, not gated)
Task 7: minor (deferred): readSettings() forceGpu read not try/catch-wrapped in StartupProvider constructor
Task 7: minor (deferred): power hold not taken while ad plays (state -1); stays held if view crashes mid-play until next event
Task 8: dispatched (BASE 40310aa, sonnet) + seeding fix ruling
Task 8: implemented bbbe391, 01e00cf (seeding fix: __internal__.migrationVersion; s13); review dispatched
Ruling: bench scenarios seed complete adblock objects (electron-conf merges defaults shallowly; seeded profiles skip the adblock migration) — cost if wrong: a partial seed leaves keys undefined in tests only.
Task 8: review -> Needs fixes (1 Important: s13 not discriminating). Fix round 1 sent. FIX_BASE 01e00cf
Task 8: minor (deferred): adblock migration array edge case; tests lack false-non-enabled key and stats.total preserve cases
Task 8: minor (deferred): seeded partial sections shallow-merge (enabled undefined) — consider deep-merging seed over defaults
Task 8: fix round 1/5 (1 addressed, 0 open; commits 01e00cf..fc027ad)
Task 8: complete (commits 40310aa..fc027ad, review clean)
Task 8: minor (deferred, pre-existing): migrations versioned from index 0 so hook 0 (legacy JSON import) never runs on an unversioned store — final review to triage
Task 9: dispatched (BASE fc027ad, opus)
Task 9: implemented d0e1c6a — s5 pass (9 blocked, 2 ad URLs); startup +2s uncached / 29ms cached; concerns: pnpm add hung + offline frozen install pruned node_modules; dev CSP handler overrides ghostery headers handler (dev only); ghostery cosmetic preload in all default-session views; review dispatched
Task 9: complete (commits fc027ad..d0e1c6a, review clean)
Task 9: node_modules restored check: `pnpm install --frozen-lockfile` reports up to date
Task 9: minor (deferred): dev-only CSP onHeadersReceived override cleared on adblock toggle-off
Task 9: minor (deferred): pnpm-lock has 13 unrelated "deprecated:" metadata lines
Ruling: Task 11 passes { loadCosmeticFilters: false } to Ghostery (adblock/service.ts) — spec's cosmetic layer is our own upsell CSS; Ghostery's preload + MutationObserver IPC runs in every app view (perf anti-goal, risk of hiding app elements) — cost if wrong: some cosmetic ads Ghostery would hide stay visible.
Task 10: dispatched (BASE d0e1c6a, opus)
Task 10: implemented a16686e — s6 pass (pruned 4, 0 ad-showing in 60s); control with prune off fails (ad shown); review dispatched
Task 10: complete (commits d0e1c6a..a16686e, review clean)
Ruling: composite/hand-augmented fixtures accepted (adSlots added; next.json grafted playerResponse) — live s6 proves real responses carry all keys and the prune-off control fails — cost if wrong: fixtures drift from YouTube's real shape unnoticed.
Task 10: minor (deferred): injected prune hooks swallow errors without any log/counter
Task 10: minor (deferred): AD_KEYS duplicated in prune.ts (self-containment) with no drift test; depth-bound test asserts only no-throw
Task 10: minor (deferred): JSON.parse/Response.json wrappers detectable via toString
Task 11: dispatched (BASE a16686e, sonnet) with rulings: count adblock:skipped in AdblockProvider; loadCosmeticFilters:false
Task 11: implemented 313a28b — s7 s8 pass, e2e 14/14; concerns: no RED phase run; s7 stats assertion not specific to skips; enforcement-message element not registered on YTM today; review dispatched
Task 11: review -> Approved with minors. Ruling: reviewer Minor 1 (swapped <video> left muted at 16x) and Minor 2 (leaked poll after stop) are load-bearing under the spec anti-goal "never interrupt playback" — sent as fix round 1 (+ emit only on real ad end) — cost if wrong: one extra fix round. FIX_BASE 313a28b
Task 11: minor (deferred): stale-config cache deleted before rebuild succeeds (offline user loses network layer until retry)
Task 11: minor (deferred): engine.test lacks cosmetic-config rebuild branch; s7 stats assertion satisfied by network blocks; toggle-off/track-change/skip-click paths untested
Task 11: ⚠️ resolved — plugin auto-discovered (s7/s8 pass in 14/14 run); nested settings payload handled both ways
Task 11: fix round 1/5 (3 addressed, 0 open; commits 313a28b..2c451e5)
Task 11: complete (commits a16686e..2c451e5, review clean)
Task 11: minor (deferred): cleanup/attach call endAd(true) so stopping mid-ad counts a skip
Task 12: dispatched (BASE 2c451e5, sonnet)
Task 12: implemented 9566a89 — e2e 15/15; review dispatched
Task 12: complete (commits 2c451e5..9566a89, review clean)
Task 12: minor (deferred): stats line shows 0 · 0 before first response; s12 writes an unrequested screenshot
Task 13: dispatched (BASE 9566a89, sonnet)
Task 13: implemented a2a0666 — e2e 15/15, verify 23/23; p1 3.17% MISSED (budget 2.36%, YTM home page cost) recorded + backlog 56; p4 1.85ms, p5 2/13ms, p7 120/120s; review dispatched
Task 13: review -> Needs fixes (2 Important: p4 "met on average" overstates; unmeasured IPC-hop claim). Fix round 1 sent. FIX_BASE a2a0666
Task 13: fix round 1/5 (2 addressed, 0 open; commits a2a0666..4cef835)
Task 13: complete (commits 9566a89..4cef835, review clean)
Task 13: minor (deferred): §8 caveat lists only 0/3/4-frame steps; IMPROVEMENTS row 58 "0.4 frame" attached to frame count
Final review: dispatched (MERGE_BASE ec7f52d, opus)
Final review: Ready with fixes — 1 Critical (stores bind userData before fork path set; pre-existing upstream bug, stray files from 15:28 dev run in %APPDATA%\ytmdesktop2), 2 Important (fullscreen state save; history pings). One fix wave dispatched (opus) incl. minors 4,5,7,8,T11. FIX_BASE 4cef835
Final fix wave: 939108d..c9a63c2 (8 commits) — unit 206/206, e2e 19/19; s5 blocked: log_event x3, generate_204, 2 pagead pixels (no watchtime/playback); signed-in history check = owner manual step; re-review dispatched
Final: re-review clean (all 8 addressed)
