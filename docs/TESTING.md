# Testing

Four tiers, from seconds to minutes. Run the smallest one that covers your change. The full and
perf suites run once, at the end of a phase.

| Tier | Command (repo root) | What runs | Typical time |
|---|---|---|---|
| Unit | `pnpm t:unit` | vitest: pure logic in `src/**/*.test.ts` and `apps/*/tests/**/*.test.ts` | < 30 s |
| Smoke | `pnpm t:smoke` (or `pnpm t:smoke layout` for one area) | Real-app scenarios tagged `smoke` (one or two per area), sharing launches | about 1 min |
| Full | `pnpm t:full` | Every functional scenario (`sNN`), keeps going after failures | a few min |
| Perf | `pnpm t:perf` | `pNN` performance scenarios; results in `tests/e2e/results/perf-*.json` | about 10 min |
| Account | `pnpm t:account` | Scenarios needing a signed-in profile (`E2E_PROFILE=signed-in`) | — |

The `t:smoke`, `t:full`, `t:perf` and `t:account` commands build first **only if something
changed**. `scripts/build-if-changed.mjs` hashes `src/` (generated files excluded), the build
config, `package.json` and `.env.local`. Use `pnpm --filter ytmdesktop2 build:cached --force`
to force a build.

## The e2e bench (`apps/ytmdesktop2/tests/e2e/`)

It launches the **real built app** on a throwaway profile (`--user-data-dir` in a temp folder)
and drives it over the Chrome DevTools Protocol:
- `t.view("youtube" | "toolbar" | /re/)` attaches to a view.
- `t.mainEval("…")` evaluates code in the main process, where
  `__YTMD_TEST__ = { services, getMainWindow }` exists only under `YTMD_E2E=1`.

```bash
cd apps/ytmdesktop2
node tests/e2e/run.ts s2 s3          # specific scenarios (unknown ids are an error)
node tests/e2e/run.ts --smoke        # fast set
node tests/e2e/run.ts --area adblock # one area (= one scenarios/*.ts file)
node tests/e2e/run.ts --keep-going   # don't stop at the first failure
node tests/e2e/run.ts --perf p4 p5   # perf scenarios
node tests/e2e/run.ts --login        # sign in once on the bench's signed-in profile
```

These commands use the existing `out/` build. Run `pnpm --filter ytmdesktop2 build:cached`
first after code changes.

**Bench runs are silent.** The app's sound is muted at the webContents level, so `video.muted`
checks still work. Perf runs (`--perf`) stay audible, because Chromium treats audible pages
differently in the background. `E2E_AUDIBLE=1` turns sound on. The test track (`TRACK_URL`) is
an official music video, so YouTube Music opens it in **Video** mode.

**When something fails:** the run stops (unless you pass `--keep-going`) and saves
`tests/e2e/results/<id>/youtube.png` plus `app-log-tail.txt`. The temp work folder is kept and
its path is printed. `tests/e2e/results/last-suite.log` and `last-perf.log` hold the last run.
`pnpm verify` turns them into `/VERIFICATION.md`.

### Writing a scenario

A scenario is an object in `tests/e2e/scenarios/<area>.ts`:

```ts
{
	id: "s17",                    // next free sNN (pNN for perf)
	title: "What it proves, in one sentence",
	smoke: true,                  // only if it's the cheapest check for its area
	reuse: true,                  // can share a launch: no startup checks, no quit/relaunch, no runtime settings changes
	launch: { settings: { … } },  // seeded settings (seed COMPLETE sections; defaults merge shallowly)
	run: async (t) => { … throw new Error("clear message") on failure … },
}
```

Then add a row to `tests/e2e/checks.ts`, so it appears in `VERIFICATION.md`.

**Rules:**
- **Only mark `reuse`** when the scenario leaves the app usable and doesn't check startup itself.
  - Between shared scenarios the runner leaves HTML fullscreen, leaves OS fullscreen,
    unmaximizes, and waits until the window is a normal 1500×800.
  - It also pauses playback and resets mute and speed.
  - It doesn't navigate: scenarios load what they need, and `play()` loads the test track.
  - If the app is gone, the runner relaunches.
- **Don't change settings at runtime** in a `reuse` scenario. Use `launch.settings` instead. The
  runner compares settings with how they were right after launch and relaunches if they changed,
  so a leak costs time, not correctness.
- **Use `play(t)`** from `lib/perf.ts` to start the test track. It skips pre-roll ads.
- **Use the mock server for third-party APIs**, never the real ones with real keys:
  ```ts
  const mock = await startMockServer();
  mock.on("GET", "/2.0/", (r) => ({ json: { … } }));
  await launchApp({ env: { YTMD_E2E_API_LASTFM: mock.url } });
  ```
  The helper `src/shared/e2e/apiBase.ts` returns the override, only when `YTMD_E2E=1`.
  **Each API client must call `apiBase(name, defaultUrl)` to build its URLs;** none do yet, and
  phase B wires Last.fm first.
  - It reads `process.env`, so call it in the main process or a preload, not in the page world.
- **The bench only kills processes it started.** If a port (9361/9362) is busy, it stops and
  tells you; close the stale app yourself.

## Unit tests

Put pure logic (math, parsing, decisions) in small functions next to the code, with a
`*.test.ts` beside them. Examples: `src/main/windows/layout.ts`, `src/shared/adblock/prune.ts`,
`tests/e2e/lib/plan.ts`. For a whole-repo run: `pnpm test` (same as `pnpm t:unit`).
