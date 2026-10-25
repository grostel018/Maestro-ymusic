# Phase 0 + 1: Test Bench, Smooth, Ad-free — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idm-clone-style end-to-end and performance bench that drives the real app, then use
it to remove the window lag and add a three-layer ad blocker.

**Architecture:** The bench launches the production build (`out/`) with a throwaway
`--user-data-dir`, talks to every view over CDP and to the main process over `--inspect`, and
prints `PASS/FAIL sNN`.

Fixes are pure functions where possible (layout, Chromium switches, ad pruning, migrations),
unit-tested with vitest and wired into the existing providers. Each fix is then proven by a
scenario in the bench.

**Tech Stack:** Electron 43, TypeScript, vitest 4, electron-vite 5, Node 24 (type stripping and
global `WebSocket` for the bench), `@ghostery/adblocker-electron` 2.20.1.

**Spec:** `docs/superpowers/specs/2026-10-25-desktop-music-overhaul-design.md` (phase 0 and phase 1;
performance budget in §8).

## Global Constraints

- **Node and pnpm:** Node ≥ 24.14; pnpm 11.15.1. Run pnpm as `pnpm` (global is 11.15.1) or
  `corepack pnpm`.
- **Bench files** run directly with `node file.ts`. That means:
  - no TS-only runtime syntax (no `enum`, no constructor parameter properties, no namespaces),
  - relative imports include the `.ts` extension,
  - no new runtime dependencies.
- **Commits:** Conventional Commits with scope, for example `feat(adblock): …`,
  `fix(window-layout): …`, `test(e2e): …`.
  - The lefthook pre-commit hook (Biome) must run. Never use `--no-verify`.
  - `pnpm test` must pass before every commit.
- **Generated files:** don't commit `apps/ytmdesktop2/resources/embeds/now-playing/`.
  Commit `src/main/contracts/services.generated.d.ts` only in Task 9, where a new service makes it
  change for real.
- **Settings:** every new settings key gets a default in `defaultSettings`
  (`src/main/trpc/routers/settings/service.ts`) and a migration hook appended to
  `src/main/trpc/routers/settings/migrations.ts`. Never reorder existing hooks.
- **Ad block failure rule:** a failure inside any ad-block layer must never stop playback or
  startup. Every layer catches its own errors, logs them and passes through.
- **Startup budget:** waiting on the ad-block engine may delay the first YouTube load by at most
  3000 ms.
- **Perf budgets** (spec §8):
  - frame time p95 ≤ 20 ms (p2, p3),
  - views match the window within 1 frame (p4, p5),
  - minimized and paused total CPU < 1% (p6),
  - minimized and playing, `currentTime` advances (p7),
  - home idle CPU at baseline −30% (p1).

## Review Focus

1. **No network on first launch.** The ad-block list download fails, but the app must still
   start, YouTube must load, and the network layer retries later. Pinned in Task 9
   (`loadEngine returns null when fetch rejects`).
2. **YouTube changes its response shape.** Unknown or frozen objects, arrays, primitives and
   very deep JSON must pass through the pruner unchanged and never throw. Pinned in Task 10
   (`prune tolerates hostile inputs`).
3. **Leaving video fullscreen while maximized.** The window returns to maximized, not normal
   size. Pinned in Task 5 (`restores maximized after html fullscreen`) and scenario s3b.
4. **Odd window sizes and display scaling** (125–150%). Bounds are whole DIP numbers and never
   negative. Pinned in Task 5 (`computeViewBounds clamps and rounds`).
5. **Upgrading with an old settings file.** A settings file without `adblock` gets every default,
   and a user who already turned something off keeps that choice. Pinned in Task 8
   (`migrateAdblockDefaults keeps user choices`).

---

## File map

| Path (under `apps/ytmdesktop2/` unless rooted) | Responsibility |
|---|---|
| `src/shared/fork.ts` | Fork identity constants (app id, names, `userData` folder, link scheme, updates off) |
| `src/main/infra/userDataPath.ts` | Pick the `userData` folder (dev / fork / explicit `--user-data-dir`) |
| `src/main/infra/testHooks.ts` | When `YTMD_E2E=1`, expose `globalThis.__YTMD_TEST__` for main-process inspection |
| `src/main/infra/chromiumSwitches.ts` | Pure list of Chromium switches per platform/settings |
| `src/main/windows/layout.ts` | Pure view-bounds math + html-fullscreen restore state |
| `src/main/domain/powerHold.ts` | Idempotent power-save-blocker holder driven by play state |
| `src/shared/adblock/prune.ts` | Pure ad-key pruning of YouTube JSON |
| `src/shared/adblock/flag.ts` | argv flag encode/decode for preload (like `shared/chromecast/flag.ts`) |
| `src/preload/adblock-prune.ts` | Builds the page-world source string from `prune.ts` and the JSON hooks |
| `src/main/trpc/routers/adblock/{index,router,service,engine}.ts` | Network blocker provider + stats router (pattern: `routers/lastfm/`) |
| `src/main/trpc/routers/settings/adblockMigration.ts` | `migrateAdblockDefaults(store)` used by the migration hook |
| `src/renderer-plugins/youtube/adblock.{plugin,renderer}.ts` | Fallback ad skipper + upsell hiding (page world) |
| `src/renderer/src/routes/_settings/player/adblock.tsx` | Settings page |
| `tests/e2e/run.ts` | Scenario runner (`sNN`, `pNN`) |
| `tests/e2e/lib/{app,cdp,wait,profile,perf,stats,suite-log}.ts` | Launch/kill, CDP + inspector RPC, waits, seeded profile, metrics, frame stats, log parsing |
| `tests/e2e/scenarios/*.ts` | Scenario definitions, grouped by area |
| `tests/e2e/verify.ts` + `tests/e2e/checks.ts` | Generate `VERIFICATION.md` |
| `/VERIFICATION.md`, `/IMPROVEMENTS.md` (repo root) | Generated checklist; weighted backlog |

---

### Task 1: Fork identity — run alongside the installed app

The installed upstream app (`net.venipa.ytmdesktop`, `userData` `ytmdesktop2`, scheme `ytmd`)
must keep working untouched next to the fork.

**Files:**
- Create: `src/shared/fork.ts`, `src/main/infra/userDataPath.ts`,
  `src/main/infra/userDataPath.test.ts`
- Modify:
  - `src/main/infra/electron.ts:25-32`: always set `userData` from `resolveUserDataDir`.
  - `electron-builder.yml`: `appId`, `productName`, `protocols[0].name` and `schemes`.
  - `src/shared/protocol/ytmdProtocol.ts:12`: `scheme = FORK.scheme`.
  - `src/main/trpc/routers/update/service.ts:380-386`: when `!FORK.updatesEnabled`, skip
    `setFeedURL` and every update check, and log once.
  - The `app.autoupdate` default becomes `FORK.updatesEnabled`.

**Interfaces:**
- Produces:
  - `FORK = { appId: "com.ytmdesktop2.plus", productName: "YTMDesktop2 Plus", userDataName: "ytmdesktop2-plus", scheme: "ytmdplus", updatesEnabled: false } as const`
  - `resolveUserDataDir(o: { isProduction: boolean; argv: readonly string[]; appData: string }): string | null`.
    It returns `null` when `--user-data-dir` (bare or `=…`) is in `argv`, otherwise
    `<appData>/ytmdesktop2-dev` in dev and `<appData>/<FORK.userDataName>` in production.

- [ ] **Step 1: Failing tests** in `userDataPath.test.ts`:
  - dev without the flag → `path.join(appData, "ytmdesktop2-dev")`,
  - production without the flag → `path.join(appData, "ytmdesktop2-plus")`,
  - either mode with `--user-data-dir=C:\\tmp\\p` → `null`,
  - production must never return a path ending in `ytmdesktop2` (protects the installed app's
    profile).
- [ ] **Step 2: Run** `pnpm test -- userDataPath`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the code and the modifications listed above. The two dev-only
  `disable-web-security` switches stay as they are. Fix any existing protocol tests that
  hard-code `ytmd://` to use `FORK.scheme`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm --filter ytmdesktop2 typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fork): own app id, profile folder and link scheme; disable upstream updates`

---

### Task 2: Bench core — launch, CDP, seeded profile, s1 boot

**Files:**
- Create: `tests/e2e/run.ts`, `tests/e2e/lib/app.ts`, `tests/e2e/lib/cdp.ts`,
  `tests/e2e/lib/wait.ts`, `tests/e2e/lib/profile.ts`, `tests/e2e/scenarios/boot.ts`
- Create: `src/main/infra/testHooks.ts`. Modify `src/main/main.ts`: call
  `exposeTestHooks({ serviceCollection, getMainWindow: () => mainWindow })` after
  `serviceCollection.exec("OnInit")`.
- Modify: `apps/ytmdesktop2/package.json` (scripts), root `package.json` (scripts), root
  `vitest.config.mts` (`include` also covers `apps/*/tests/**/*.test.ts`)

**Interfaces:**
- Produces (used by every scenario):
  - `type Scenario = { id: string; title: string; run: (t: TestApp) => Promise<void> }`. `id` is
    `sNN` or `pNN`.
  - `launchApp(opts?: { extraArgs?: string[]; settings?: Record<string, unknown> }): Promise<TestApp>`
  - `TestApp`:
    - `mainEval<T>(expr: string): Promise<T>`, which evaluates in the main process via the
      inspector, with `globalThis.__YTMD_TEST__` available.
    - `view(match: "youtube" | "toolbar" | RegExp): Promise<CdpSession>`
    - `profileDir: string`, `workDir: string`
    - `close(): Promise<void>`
  - `CdpSession`:
    - `call(method, params?)`
    - `eval<T>(expr: string, opts?: { userGesture?: boolean }): Promise<T>`
    - `on(event, cb)`
    - `screenshot(file)`
  - `waitFor<T>(fn: () => Promise<T | false>, timeoutMs: number, what: string): Promise<T>`
  - `globalThis.__YTMD_TEST__ = { services, getMainWindow }`. It exists only when
    `process.env.YTMD_E2E === "1"`.
- Constants in `lib/app.ts`:
  - `PORTS = { cdp: 9361, inspect: 9362 }`
  - `TRACK_URL = "https://music.youtube.com/watch?v=dQw4w9WgXcQ"`. It is a stable public track;
    change it here if it ever becomes unavailable.

- [ ] **Step 1: Write scenario s1** in `scenarios/boot.ts`. It checks:
  - a CDP target exists whose URL starts with `https://music.youtube.com/`,
  - `mainEval("__YTMD_TEST__.getMainWindow().main.contentView.children.length")` returns 2
    (toolbar + YouTube; the loading view has been removed),
  - `mainEval("process.mainModule.require('electron').app.getPath('userData')")` equals
    `t.profileDir`.
- [ ] **Step 2: Run** `node tests/e2e/run.ts s1` with the harness stubbed. Expected: FAIL.
- [ ] **Step 3: Implement the harness**, following `R:\suspicious folder\idm-clone\tests\e2e\run.js`
  for shape.
  - **Work folder.** At startup, delete stale `ytmd-e2e-*` temp folders, then create a new
    `workDir`.
  - **Seeded profile.** `profile.ts` writes `<profile>/app-settings.yml` with
    `app.autostart: false`, `app.autoupdate: false`, `app.enableStatisticsAndErrorTracing: false`
    and `app.getstarted: false`, plus `opts.settings` deep-merged on top. Use the `yaml` package,
    which is already a dependency of the app workspace.
  - **Signed-in runs.**
    - `node tests/e2e/run.ts --login` launches the app on the persistent bench profile
      `%LOCALAPPDATA%\ytmd-e2e\signed-in` and waits until the window is closed. The owner signs
      in to a throwaway Google account by hand. The bench never types credentials.
    - With `E2E_PROFILE=signed-in`, each run copies that profile into `<profile>` first,
      skipping `Cache`, `Code Cache`, `GPUCache` and `logs`, then writes the seeded settings over
      it. The source profile is never written to.
    - Only scenarios marked `account: true` need it; they are skipped with `SKIP sNN` when it's
      absent.
  - **Launch.** Spawn `node_modules/electron/dist/electron.exe` with:
    - `apps/ytmdesktop2`,
    - `--user-data-dir=<profile>`,
    - `--remote-debugging-port=9361`,
    - `--inspect=9362`,
    - environment `YTMD_E2E=1`.
  - **Targets.** Use `/json/list` to find views by URL. Main-process RPC goes through the
    inspector's `/json/list` websocket and `Runtime.evaluate` with `awaitPromise: true`.
  - **Runner.** Run scenarios in order, filtered by argv ids. Print `PASS sNN title` or
    `FAIL sNN title: <error>`, then `<passed>/<total> passed`, and exit 1 on any failure. Tee
    all output to `tests/e2e/results/last-suite.log`.
  - **Cleanup.** `killTree` uses `taskkill /PID <pid> /T /F`. A failure keeps `workDir` and saves
    a screenshot of the YouTube view. `E2E_KEEP=1` always keeps it.
  - **GPU log.** Log `SystemInfo.getInfo` GPU device names once per run.
- [ ] **Step 4: Add scripts.**
  - App:
    - `"test:e2e": "electron-vite build && node tests/e2e/run.ts"`
    - `"test:perf": "electron-vite build && node tests/e2e/run.ts --perf"`
    - `"verify": "node tests/e2e/verify.ts"`
  - Root: the same three as `pnpm --filter ytmdesktop2 <name>`.
  - Add `tests/e2e/results/` to `.gitignore`.
- [ ] **Step 5: Run** `pnpm test:e2e s1`. Expected: `PASS s1` and `1/1 passed`.
- [ ] **Step 6: Commit** `test(e2e): add isolated-profile CDP bench with boot scenario`

---

### Task 3: Perf metrics and baseline scenarios p1–p7

**Files:**
- Create: `tests/e2e/lib/stats.ts`, `tests/e2e/lib/stats.test.ts`, `tests/e2e/lib/perf.ts`,
  `tests/e2e/scenarios/perf.ts`

**Interfaces:**
- Produces:
  - `summarizeFrames(deltasMs: number[]): { p50: number; p95: number; max: number; droppedPct: number }`.
    `droppedPct` is the share of deltas over 25 ms.
  - `sampleFrames(view: CdpSession, ms: number): Promise<number[]>`. It injects a
    `requestAnimationFrame` sampler and returns the frame deltas.
  - `sampleCpu(t: TestApp, ms: number): Promise<{ avgPct: number; byType: Record<string, number> }>`,
    using `app.getAppMetrics()` `cpu.percentCPUUsage` sampled every 1000 ms.
  - `recordPerf(id: string, data: object): void`. It appends to
    `tests/e2e/results/perf-<runStamp>.json`.
  - `play(t: TestApp): Promise<void>`. It navigates the YouTube view to `TRACK_URL`, calls
    `#movie_player.playVideo()` with `userGesture: true`, and waits until `currentTime > 1`.

- [ ] **Step 1: Write the failing test** `stats.test.ts`:

```ts
it("summarizes frame deltas", () => {
	const d = [...Array(95).fill(16), 30, 30, 30, 30, 100];
	expect(summarizeFrames(d)).toEqual({ p50: 16, p95: 30, max: 100, droppedPct: 5 });
});
it("handles empty input", () => {
	expect(summarizeFrames([])).toEqual({ p50: 0, p95: 0, max: 0, droppedPct: 0 });
});
```

- [ ] **Step 2: Run** `pnpm test -- stats`. Expected: FAIL.
- [ ] **Step 3: Implement** `summarizeFrames` using nearest-rank percentiles, plus `perf.ts`.
- [ ] **Step 4: Run** `pnpm test -- stats`. Expected: PASS.
- [ ] **Step 5: Write the perf scenarios**, run only with `--perf`. Each one records numbers and
  fails only where the spec sets a hard rule; budgets are checked in Task 13.
  - p1: home idle CPU, 10 s.
  - p2: `play()`, then frames for 10 s on the player page at 1500×800.
  - p3: same as p2 after `maximize()`.
  - p3b: same as p2 in YouTube Music's HTML fullscreen (`document.querySelector('video')
    .requestFullscreen()` with `userGesture`). This is the "fullscreen button" the owner meant.
  - p4: resize sweep. 20 `setSize` steps of 1000→1600 px. After each step, count frames until
    the YouTube view's `getBounds().width` equals `getContentSize()[0]`.
  - p5: same check after entering and leaving fullscreen.
  - p6: pause, `minimize()`, CPU for 60 s.
  - p7: `play()`, `minimize()`, then `currentTime` must advance ≥ 100 s over 120 s. This is a
    hard fail.
- [ ] **Step 6: Record the baseline.** Run `pnpm test:perf` **before Task 5** and copy the JSON
  to `tests/e2e/baseline/perf-baseline.json` (committed).
- [ ] **Step 7: Commit** `test(perf): add frame/CPU sampling and baseline perf scenarios`

---

### Task 4: VERIFICATION.md generator and IMPROVEMENTS.md backlog

**Files:**
- Create: `tests/e2e/lib/suite-log.ts`, `tests/e2e/lib/suite-log.test.ts`,
  `tests/e2e/checks.ts`, `tests/e2e/verify.ts`, `/IMPROVEMENTS.md`

**Interfaces:**
- Produces:
  - `parseSuiteLog(text: string): { passed: Set<string>; failed: Set<string>; summary: { passed: number; total: number } | null }`
  - `type Check = { area: string; check: string; evidence: string[] }`
  - `CHECKS: Check[]`

- [ ] **Step 1: Failing test.** Parsing `"PASS s1 boot\nFAIL s3 fullscreen: x\n1/2 passed\n"`
  gives `passed={s1}`, `failed={s3}` and `summary={passed:1,total:2}`.
- [ ] **Step 2: Run** `pnpm test -- suite-log`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseSuiteLog` and `verify.ts`.
  - It writes `/VERIFICATION.md` in the same table format as idm-clone's: `# | Area | Check |
    Evidence | Result | Notes`.
  - A row is `[x]` only when every evidence id passed.
  - The header gives the date and `Suite: <p>/<t> passed`.
  - Seed `CHECKS` with one row per scenario from Tasks 2–12.
- [ ] **Step 4: Write `/IMPROVEMENTS.md`.**
  - Copy idm-clone's "How this file is maintained" rules (weights 0–100, tier thresholds 89+ /
    72–88 / 51–71 / 29–50 / 10–28 / <10, S/M/L effort, status values, IDs never change).
  - Seed rows for the remaining items of spec phases 2–6, one row per bullet, IDs starting at 1.
  - Set `Next free ID` accordingly.
- [ ] **Step 5: Run** `pnpm test -- suite-log`, then `pnpm verify`. Expected: PASS, and
  `VERIFICATION.md` is written with s1 ticked.
- [ ] **Step 6: Commit** `docs(e2e): generate VERIFICATION.md from suite log and seed backlog`

---

### Task 5: Single layout path, html fullscreen, opaque toolbar

**Files:**
- Create: `src/main/windows/layout.ts`, `src/main/windows/layout.test.ts`,
  `tests/e2e/scenarios/layout.ts`
- Modify:
  - `src/main/windows/windowManager.ts:150-198` (view creation),
  - `src/main/windows/windowManager.ts:292-326` (window events and `updateViewBounds`),
  - `src/main/windows/view.ts`: `createView` and `createApiView` get the option
    `lockSize: LockSizeOptions | false`. When it is `false`, skip `lockSizeToParent`.

**Interfaces:**
- Produces:
  - `type Rect = { x: number; y: number; width: number; height: number }`
  - `computeViewBounds(content: { width: number; height: number }, opts: { toolbarHeight: number; htmlFullscreen: boolean }): { toolbar: Rect | null; youtube: Rect }`
  - `createFullscreenRestore(): { enter(state: { maximized: boolean; fullScreen: boolean }): void; leave(): { maximized: boolean; fullScreen: boolean } | null }`

- [ ] **Step 1: Failing tests** in `layout.test.ts`:
  - `computeViewBounds({width:1500,height:800},{toolbarHeight:36,htmlFullscreen:false})` returns
    `{toolbar:{x:0,y:0,width:1500,height:36}, youtube:{x:0,y:36,width:1500,height:764}}`.
  - `htmlFullscreen:true` returns `toolbar:null` and `youtube:{x:0,y:0,width:1500,height:800}`.
  - `computeViewBounds clamps and rounds`: `{width:1500.6,height:20}` with toolbar 36 gives
    whole numbers, `youtube.height === 0` and nothing negative.
  - `restores maximized after html fullscreen`: `enter({maximized:true, fullScreen:false})`, then
    `leave()` returns `{maximized:true, fullScreen:false}`. A second `leave()` returns `null`.
- [ ] **Step 2: Run** `pnpm test -- layout`. Expected: FAIL.
- [ ] **Step 3: Implement** `layout.ts`. Then rewire `WindowManager`:
  - **Views.** The YouTube, toolbar and loading views are created with `lockSize: false`.
  - **One `applyLayout()` method.** It reads `getContentSize()` and calls `computeViewBounds`.
    When `toolbar` is `null`, it removes the toolbar view from `contentView`; otherwise it
    re-adds it at the top and sets its bounds. The loading view, when present, gets the full
    content bounds.
  - **Events.** Call `applyLayout()` without any debounce on `resize`, `maximize`, `unmaximize`,
    `enter-full-screen` and `leave-full-screen`.
  - **HTML fullscreen.** On the YouTube view's `enter-html-full-screen`:
    1. `restore.enter({ maximized, fullScreen })`,
    2. `setFullScreen(true)`,
    3. `applyLayout()` with `htmlFullscreen: true`.

    On `leave-html-full-screen`, apply the state from `restore.leave()`: `setFullScreen(prev.fullScreen)`,
    then `maximize()` when `prev.maximized`, then `applyLayout()`.
  - **Toolbar.** Create it without `transparent: true` and call
    `view.setBackgroundColor("#030404")`.
- [ ] **Step 4: Run** `pnpm test -- layout`. Expected: PASS.
- [ ] **Step 5: Write scenarios** in `scenarios/layout.ts`:
  - s2: after `setSize(1200,700)`, `maximize()` and `unmaximize()`, the views equal
    `computeViewBounds` of `getContentSize()`.
  - s3: html fullscreen. On a playing track, run
    `document.querySelector('video').requestFullscreen()` with `userGesture`. Then the toolbar is
    detached and the YouTube view bounds equal the content size. `document.exitFullscreen()`
    restores both.
  - s3b: same as s3 starting from maximized. The window is maximized again after exit.
- [ ] **Step 6: Run** `pnpm test:e2e s1 s2 s3 s3b`. Expected: all PASS.
- [ ] **Step 7: Commit** `fix(window-layout): resize views synchronously and handle html fullscreen`

---

### Task 6: Cheap artwork background, glass behind a setting

**Files:**
- Create: `src/main/trpc/routers/themes/assets/chrome/glass.scss`. It takes the full-page
  `backdrop-filter` rules and the `filter: … blur(16px)` rule out of `blur.scss`.
- Modify:
  - `src/main/trpc/routers/themes/assets/chrome/blur.scss`: keep only the dialog/listbox/player-bar
    blur.
  - `src/main/trpc/routers/themes/assets/chrome/thumbnail-bg.scss`
  - `src/main/trpc/routers/themes/service.ts:60-200`: compile and inject `glass` when
    `themes.glass`.
  - `src/main/trpc/routers/themes/types.ts`: `glass: boolean`.
  - `src/renderer-plugins/youtube/track-theme.renderer.ts`: produce `--ytmd-thumbnail-blur-url`.
  - Settings defaults (`themes.glass: false`) and a migration hook.
  - `src/renderer/src/routes/_settings/appearance/themes.tsx`: checkbox "Glass effect (uses more
    GPU)".
- Test: `tests/e2e/scenarios/glass.ts`

**Interfaces:**
- Produces:
  - CSS variable `--ytmd-thumbnail-blur-url`, a `url("data:image/jpeg;…")` image at most 64×64,
    pre-blurred.
  - Settings key `themes.glass: boolean`.

- [ ] **Step 1: Write scenario s4.**
  - On the player page with defaults, no element covering more than 50% of the viewport has a
    computed `backdrop-filter` other than `none`.
  - The `::before` background of `.content.ytmusic-player-page` uses an image starting with
    `url("data:image/`, and its computed `filter` contains no `blur`.
  - With `settings: { themes: { glass: true } }`, the first check finds at least one such element.
- [ ] **Step 2: Run** `pnpm test:e2e s4`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Blurred thumbnail.** In `track-theme.renderer.ts`, on each thumbnail change, draw the
    thumbnail into a 48×48 `OffscreenCanvas` with `ctx.filter = "blur(3px)"`, export it with
    `convertToBlob({type:"image/jpeg", quality:0.7})`, then turn it into a data URL. Cache the
    result per thumbnail URL (the last 20).
  - **CSS.** `thumbnail-bg.scss` uses `var(--ytmd-thumbnail-blur-url, var(--ytmd-thumbnail-url))`
    with `image-rendering: auto`, no `filter`, and `transform: translateZ(0)`.
  - **Migration.** The hook sets `themes.glass=false` when it is missing.
- [ ] **Step 4: Run** `pnpm test:e2e s4` and `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `perf(themes): replace full-page blur with pre-blurred artwork, glass opt-in`

---

### Task 7: Let Chromium rest, power hold only while playing

**Files:**
- Create: `src/main/infra/chromiumSwitches.ts`, `src/main/infra/chromiumSwitches.test.ts`,
  `src/main/domain/powerHold.ts`, `src/main/domain/powerHold.test.ts`,
  `tests/e2e/scenarios/background.ts`
- Modify:
  - `src/main/trpc/routers/startup/service.ts:20-65`: apply switches from `chromiumSwitches`.
    Replace the unconditional `powerSaveBlocker.start` with a `PowerHold` driven by
    `serverMain.on(IPC_EVENT_NAMES.TRACK_PLAYSTATE)`.
  - `src/main/trpc/routers/mediaControl/service.ts:27-33`: delete the `in-progress-gpu` switch.
  - `src/main/windows/view.ts`: `createApiView` stops forcing `backgroundThrottling: false`.
    `createView` (YouTube) keeps it.
  - `src/main/windows/windowManager.ts`: auto-open DevTools only when
    `process.env.YTMD_DEVTOOLS === "1"`.
  - Settings `app.forceGpu: false`, a migration, and a checkbox next to `app.disableHardwareAccel`
    in `src/renderer/src/routes/_settings/index.tsx`.

**Interfaces:**
- Produces:
  - `chromiumSwitches(o: { platform: "win32" | "darwin" | "linux"; forceGpu: boolean; isDevelopment: boolean; gtkVersion?: string }): { switches: Array<[string, string?]>; enableFeatures: string[]; disableFeatures: string[] }`
  - `createPowerHold(api: { start(): number; stop(id: number): void }): { set(playing: boolean): void; isHeld(): boolean }`

- [ ] **Step 1: Failing tests.**
  - `chromiumSwitches({platform:"win32", forceGpu:false, isDevelopment:false})`:
    - includes `["enable-gpu-rasterization"]`,
    - excludes `ignore-gpu-blocklist`, `disable-renderer-backgrounding`,
      `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows` and
      `in-progress-gpu`,
    - `disableFeatures` equals `["IntensiveWakeUpThrottling","UseEcoQoSForBackgroundProcess","MediaSessionService"]`.
  - With `forceGpu:true`, it includes `["ignore-gpu-blocklist"]`.
  - `createPowerHold`: `set(true)` twice calls `start` once; `set(false)` calls `stop(id)` once;
    `isHeld()` follows along.
- [ ] **Step 2: Run** `pnpm test -- chromiumSwitches powerHold`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions, then wire them in. `forceGpu` is read from the
  settings file in `StartupProvider`'s constructor; if the settings provider isn't readable that
  early, read the YAML directly the same way the store does.
- [ ] **Step 3b: Keep the switch removal only if it earns its place.** These switches are
  process-wide and the maintainer added them on purpose. Run `pnpm test:perf p6 p7` with the
  four backgrounding/occlusion switches removed, then again with them restored.
  - Keep the removal only if p6 CPU drops by ≥ 30% *and* p7 passes.
  - Otherwise restore them in `chromiumSwitches`, update its test to expect them, and write the
    measured numbers in spec §8.

  The per-view `backgroundThrottling` change and the power hold are kept either way.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Write scenarios.**
  - s9: `play()`, then `minimize()`. After 5 s the toolbar view's `document.visibilityState` is
    `"hidden"`, and the YouTube `currentTime` advanced ≥ 4 s.
  - s10: while playing, `__YTMD_TEST__` reports the power hold as held. After pause and 1 s, it
    isn't. Expose `isHeld` through the startup provider.
  - s11: `app.commandLine.hasSwitch("ignore-gpu-blocklist") === false`, and the four
    backgrounding switches match what Step 3b decided.
- [ ] **Step 6: Run** `pnpm test:e2e s9 s10 s11`. Expected: PASS.
- [ ] **Step 7: Commit** `perf(startup): stop forcing background rendering; hold power only while playing`

---

### Task 8: Ad-block settings and migration

**Files:**
- Create: `src/main/trpc/routers/settings/adblockMigration.ts`,
  `src/main/trpc/routers/settings/adblockMigration.test.ts`, `src/shared/adblock/flag.ts`,
  `src/shared/adblock/flag.test.ts`
- Modify: `defaultSettings` (`settings/service.ts`), `migrations.ts` (append a hook calling
  `migrateAdblockDefaults`)

**Interfaces:**
- Produces:
  - Settings
    `adblock: { enabled: boolean; network: boolean; prune: boolean; fallback: boolean; hideUpsells: boolean; stats: { total: number } }`.
    The defaults are all `true`, with `stats.total: 0`.
  - `migrateAdblockDefaults(store: { store: unknown; set(key: string, v: unknown): void }): void`
  - In `flag.ts`:
    - `ADBLOCK_ARGV_FLAG = "--ytmd-adblock"`
    - `adblockArgvFor(o: { prune: boolean; fallback: boolean }): string`, which produces e.g.
      `--ytmd-adblock=prune,fallback` or `--ytmd-adblock=`
    - `adblockFromArgv(argv: readonly string[]): { prune: boolean; fallback: boolean }`, which
      defaults to both `false` when the flag is absent.

- [ ] **Step 1: Failing tests.**
  - `migrateAdblockDefaults keeps user choices`. With `store.store = { adblock: { enabled: false } }`,
    it sets every missing key (`network`, `prune`, `fallback`, `hideUpsells` as `true`;
    `stats.total` as 0) and never sets `adblock.enabled`.
  - An empty store gets the full default object.
  - `adblockFromArgv([adblockArgvFor({prune:true, fallback:false})])` deep-equals
    `{prune:true, fallback:false}`.
- [ ] **Step 2: Run** `pnpm test -- adblockMigration flag`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(adblock): add settings, migration and preload argv flag`

---

### Task 9: Network blocking layer

**Files:**
- Create: `src/main/trpc/routers/adblock/{index,router,service}.ts` (pattern:
  `routers/lastfm/`), `src/main/trpc/routers/adblock/engine.ts`,
  `src/main/trpc/routers/adblock/engine.test.ts`, `tests/e2e/scenarios/adblock.ts`
- Modify:
  - `src/main/trpc/router.ts`: add `adblock: adblockRouter`.
  - `src/main/main.ts`: in `app.on("ready")`, before `createRootWindow()`, run
    `await serviceCollection.getTypedProvider("adblock").attach(session.defaultSession, { timeoutMs: 3000 })`.
  - `apps/ytmdesktop2/package.json`: add the dependency `"@ghostery/adblocker-electron": "2.20.1"`.
  - `src/main/contracts/services.generated.d.ts`: regenerated by the build. Commit it.

**Interfaces:**
- Consumes: `adblock.*` settings (Task 8).
- Produces:
  - In `engine.ts`:
    - `isEngineStale(mtimeMs: number, nowMs: number): boolean`, true when older than 7 days.
    - `loadEngine(opts: { cachePath: string; fetchImpl: typeof fetch; now?: () => number }): Promise<ElectronBlocker | null>`.
      It never throws; it returns `null` on any failure.
  - On `AdblockProvider` (name `"adblock"`):
    - `attach(ses: Session, o: { timeoutMs: number }): Promise<void>`. If the engine isn't
      ready within `timeoutMs`, it resolves anyway and attaches when the engine arrives. After a
      failure it retries once an hour.
    - `stats(): { session: number; total: number }`
  - tRPC route `adblock.stats` (query).

- [ ] **Step 1: Failing tests.**
  - `isEngineStale(now - 8*86400e3, now) === true` and `isEngineStale(now - 86400e3, now) === false`.
  - `loadEngine returns null when fetch rejects`: with no cache file and a rejecting `fetchImpl`,
    it resolves `null`.
- [ ] **Step 2: Run** `pnpm test -- engine`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `loadEngine` uses `ElectronBlocker.fromPrebuiltAdsAndTracking(fetchImpl, { path, read, write })`,
    and deletes a stale cache first.
  - The provider enables blocking only when `adblock.enabled && adblock.network`. It reacts to
    those settings with `enableBlockingInSession` / `disableBlockingInSession`.
  - It counts `request-blocked` events, persists `adblock.stats.total` debounced at 10 s, and
    logs failures.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Write scenario s5.** Run `play()` while recording the YouTube target's
  `Network.loadingFailed` events. At least one fails with `net::ERR_BLOCKED_BY_CLIENT` for a URL
  matching `/doubleclick\.net|googlesyndication|\/pagead\/|\/api\/stats\/ads/`. `currentTime`
  advances ≥ 8 s over 10 s, and the `adblock.stats` session count is greater than 0.
- [ ] **Step 6: Run** `pnpm test:e2e s5`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(adblock): block ad and tracker requests with ghostery engine`

---

### Task 10: Response pruning layer (page world, before YouTube's scripts)

**Files:**
- Create: `src/shared/adblock/prune.ts`, `src/shared/adblock/prune.test.ts`,
  `src/shared/adblock/fixtures/{player,next}.json` (trimmed real responses: capture them with
  the bench, remove personal data), `src/preload/adblock-prune.ts`
- Modify:
  - `src/main/windows/windowManager.ts:174`: append
    `adblockArgvFor({ prune: enabled && prune, fallback: enabled && fallback })` to
    `additionalArguments`.
  - `src/preload/youtube.ts`: before `void injectYtmdAgent()`, call `void injectAdblockPrune()`.
    It injects into world 0 the same way as the agent, and only when
    `adblockFromArgv(process.argv).prune`.

**Interfaces:**
- Produces:
  - `AD_KEYS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"] as const`
  - `pruneAds(data: unknown): number`. It mutates in place and returns the number of keys
    removed. It searches at most depth 4 and looks in the root, `playerResponse`, and items of a
    top-level array. It removes `enforcementMessageViewModel` wherever it is found within that
    depth, and it must be self-contained: no imports, no closures over module scope.
  - `ADBLOCK_PRUNE_SOURCE: string`, an IIFE built in `adblock-prune.ts` from
    `pruneAds.toString()`. It:
    - wraps `JSON.parse` and `Response.prototype.json`. Only results that are objects containing
      one of `AD_KEYS`, `playerResponse` or `auxiliaryUi` get pruned.
    - defines accessor setters for `ytInitialPlayerResponse` and `ytInitialData` that prune on
      set.
    - wraps every hook in `try/catch`, returning the original value on error.
    - keeps a running count in `window.__YTMD_ADBLOCK__ = { pruned: number }`.

- [ ] **Step 1: Failing tests** in `prune.test.ts`:
  - The player fixture loses all four `AD_KEYS`, `pruneAds` returns 4, and `streamingData` and
    `videoDetails` deep-equal the originals.
  - The next fixture with nested `playerResponse.adPlacements` returns at least 1, and
    `contents` is unchanged.
  - `enforcementMessageViewModel` under `auxiliaryUi.messageRenderers` is removed.
  - It is idempotent: a second call returns 0.
  - `prune tolerates hostile inputs`: `null`, `42`, `"x"`, `[]`, `Object.freeze({adPlacements:[]})`
    (returns 0, no throw) and a 10,000-level nested object (no throw) all pass.
  - `new Function("return " + pruneAds.toString())()` works on the player fixture. This proves
    the function is self-contained.
- [ ] **Step 2: Run** `pnpm test -- prune`. Expected: FAIL.
- [ ] **Step 3: Implement** `pruneAds`, `ADBLOCK_PRUNE_SOURCE` and the preload injection.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Write scenario s6.** After `play()`:
  - `#movie_player.getPlayerResponse()` has none of `AD_KEYS`,
  - `window.__YTMD_ADBLOCK__.pruned > 0`,
  - sampling every 500 ms for 60 s, `#movie_player` never has class `ad-showing`.
- [ ] **Step 6: Run** `pnpm test:e2e s6`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(adblock): prune ad payloads from YouTube responses at document start`

---

### Task 11: Fallback skipper and upsell hiding (renderer plugin)

**Files:**
- Create: `src/renderer-plugins/youtube/adblock.plugin.ts`,
  `src/renderer-plugins/youtube/adblock.renderer.ts`
- Test: `tests/e2e/scenarios/adblock.ts` (add s7, s8)

**Interfaces:**
- Consumes: `adblockFromArgv` is not available in the page world. The renderer reads
  `ctx.ytmd.settings.get("adblock")` and reacts in `onConfigChange` for `adblock.fallback` and
  `adblock.hideUpsells`.
- Produces:
  - A page event `ctx.ytmd.emit("adblock:skipped")` per handled ad, counted by `AdblockProvider`
    into `stats().session`.
  - A `<style id="ytmd-adblock-upsell">` element while `hideUpsells` is on.

- [ ] **Step 1: Write scenarios.**
  - s7: during playback, the test adds class `ad-showing` to `#movie_player`. Within 1 s the
    `video` is `muted === true` with `playbackRate === 16`. Removing the class restores the
    previous `muted` and `playbackRate` within 1 s.
  - s8: the test appends `<ytmusic-mealbar-promo-renderer>` and
    `<ytmusic-enforcement-message-view-model>` to `ytmusic-app`. Their computed `display` is
    `none`. With `hideUpsells` set to `false` via settings, they are visible.
- [ ] **Step 2: Run** `pnpm test:e2e s7 s8`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Watcher.** Use one `MutationObserver` on `#movie_player` with
    `{ attributes: true, attributeFilter: ["class"] }`, never `subtree`.
  - **On entering `ad-showing`:** save `muted` and `playbackRate`, mute, set the rate to 16, and
    click the first visible element matching
    `.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern`. Poll every 250 ms
    while the ad lasts.
  - **On leaving it:** restore the saved values and emit `adblock:skipped`.
  - **Upsell CSS:** hide `ytmusic-mealbar-promo-renderer`, `ytmusic-enforcement-message-view-model`,
    `tp-yt-paper-dialog:has(ytmusic-mealbar-promo-renderer)` and
    `ytmusic-statement-banner-renderer`. Check each selector against the live page with the
    bench before committing.
- [ ] **Step 4: Run** `pnpm test:e2e s7 s8`, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(adblock): fallback ad skipper and premium upsell hiding`

---

### Task 12: Ad-block settings page

**Files:**
- Create: `src/renderer/src/routes/_settings/player/adblock.tsx`
- Modify: the player settings navigation in `src/renderer/src/routes/_settings/player/route.tsx`,
  which links to the new page.

**Interfaces:**
- Consumes: the `adblock.*` keys and the `adblock.stats` query.

- [ ] **Step 1: Build the page** with `SettingsCheckbox`:
  - "Block ads" (`adblock.enabled`),
  - an advanced group with:
    - "Block ad servers" (`adblock.network`),
    - "Remove ads from YouTube responses" (`adblock.prune`, with a "Restart required" badge),
    - "Skip ads that slip through" (`adblock.fallback`, also "Restart required"),
    - "Hide Premium pop-ups" (`adblock.hideUpsells`),
  - a stats line "Blocked this session: N · All time: M", refreshed every 5 s.
- [ ] **Step 2: Write scenario s12.** Open the settings window via `__YTMD_TEST__`, navigate to
  `#/player/adblock`, and assert that the five checkboxes render with the seeded values and that
  the stats line matches `/Blocked this session: \d+/`.
- [ ] **Step 3: Run** `pnpm test:e2e s12` and `pnpm --filter ytmdesktop2 typecheck`. Expected:
  PASS.
- [ ] **Step 4: Commit** `feat(adblock): settings page with layer toggles and counters`

---

### Task 13: Measure against budget, regenerate reports

**Files:**
- Modify: the spec's §8 table (add a "Measured before → after" column), `/VERIFICATION.md`
  (generated), `/IMPROVEMENTS.md`

- [ ] **Step 1: Run** `pnpm test:e2e`. Expected: every `sNN` passes.
- [ ] **Step 2: Run** `pnpm test:perf`, then compare against
  `tests/e2e/baseline/perf-baseline.json` with the §8 budgets.
- [ ] **Step 3: Handle any budget misses.** For each miss, either find and fix the cause, with
  its own commit and scenario, or record the measured number in §8 with the reason. Never just
  loosen a check in code.
- [ ] **Step 4: Run** `pnpm verify`. Move the finished phase 0 and phase 1 items to the Done
  table in `IMPROVEMENTS.md`.
- [ ] **Step 5: Commit** `docs(perf): record phase 1 measurements and refresh verification`
