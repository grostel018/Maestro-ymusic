# Architecture

How YTMDesktop2 Plus is put together, and where new code goes. Read this before changing anything.
For the roadmap and its reasons, see `docs/superpowers/plans/2026-10-25-master-roadmap.md`.

## The big picture

```
┌─ Electron main process ──────────────────────────────────────────────────────────┐
│  src/main/main.ts  (first import: infra/userDataBootstrap — sets the profile dir)│
│  providers  src/main/trpc/routers/<name>/service.ts  (auto-registered)           │
│  windows    src/main/windows/  (WindowManager, layout.ts, views, popups)         │
│  settings   app-settings.yml + migrations (src/main/trpc/routers/settings/)      │
└──────────────┬──────────────────────────────────┬────────────────────────────────┘
               │ IPC / tRPC                        │ IPC (ytmd bridge)
┌──────────────▼───────────────┐   ┌───────────────▼──────────────────────────────────┐
│ Our React views (src/renderer)│   │ YouTube view: music.youtube.com                  │
│ toolbar, settings, tray view, │   │  preload  src/preload/youtube.ts (isolated)      │
│ loading screen                │   │  page world ("world 0"): src/renderer-plugins/   │
└───────────────────────────────┘   │   youtube/*.renderer.ts, ad-block prune script   │
                                    └──────────────────────────────────────────────────┘
```

**The YouTube page is the engine.** Playback, sign-in, library and search come from the real
YouTube Music web page, running in a `WebContentsView`. We add features in three places:

| Where | What runs there | Examples |
|---|---|---|
| **Main process** (`src/main`) | Window/view layout, settings store, network-level work, OS integration | `windows/windowManager.ts`, `trpc/routers/adblock/` (network blocker), `lastfm/`, `discord/` |
| **Page world** (`src/renderer-plugins/youtube/`) | Code that touches YouTube's DOM, player or responses | `adblock.renderer.ts` (fallback skipper), `track-theme.renderer.ts`, `lyrics/` |
| **Our React views** (`src/renderer`) | Our own UI | settings pages `routes/_settings/…`, toolbar `routes/youtube/toolbar.tsx` |

## Main process

- **Providers.** Every `src/main/trpc/routers/<name>/service.ts` default-exports a class
  extending `BaseProvider`. It's auto-registered (`src/main/core/baseCollection.ts` globs
  them) and gets lifecycle hooks: `BeforeStart` (before app ready), `OnInit`, `AfterInit`,
  `OnDestroy`.
  - Look up another provider with `this.getProvider("settings")`.
  - Expose a provider to our React views by adding `router.ts` and registering it in
    `src/main/trpc/router.ts`.
  - The generated typings (`src/main/contracts/services.generated.d.ts`) change only when a
    service is added.
- **Settings.**
  - `defaultSettings` lives in `src/main/trpc/routers/settings/service.ts`.
  - Every new key needs a migration **appended** to `migrations.ts`, never reordered: the
    migration version is the array index.
  - React with `onSettingChange(keys, handler)`.
- **Profile folder.**
  - `src/main/infra/userDataBootstrap.ts` must stay the **first import** of `main.ts`, so every
    store opens in the fork's own folder (`%APPDATA%\ytmdesktop2-plus`).
  - `--user-data-dir` overrides it, and the bench relies on that.
  - Never touch the upstream app's folders.
- **Window layout.**
  - `WindowManager.applyLayout()` is the only place that sizes views; the bounds math is in
    `windows/layout.ts` (pure, unit-tested).
  - It runs synchronously on resize and re-checks after state changes (maximize, fullscreen).
- **Fork identity.** `src/shared/fork.ts` holds the app id, product name, profile folder,
  `ytmdplus://` scheme, and the setting that keeps upstream updates off.

## Page world (inside YouTube Music)

- **Plugins.** A plugin is `src/renderer-plugins/youtube/<name>.plugin.ts` (metadata, created
  with `definePlugin`) plus `<name>.renderer.ts` (page-world code).
  - The world-0 host (`world0/host.ts`) auto-loads every `*.renderer.ts`.
  - It calls `start(ctx)`, `onConfigChange(key, value, ctx)` and `onPlayerApiReady(playerApi)`.
  - `ctx.ytmd` gives settings get/set and `emit`/`on` to main. Page events have to be on the
    allow-list in `src/preload/ytmd-bridge.ts`.
- **Document-start scripts.**
  - Code that must run before YouTube's own scripts is injected from `src/preload/youtube.ts`
    with `executeJavaScriptInIsolatedWorld(0, …)`. Examples: the ad-block prune script, the
    ytmd agent.
  - Settings it needs at that moment come through a launch argument (`src/shared/*/flag.ts`).
    That's why some toggles say "restart required".
- **Rules:**
  - Never block or slow the page.
  - Watch the narrowest thing possible (one element, `attributeFilter`), never `subtree` on
    `document`.
  - Every hook must fail safe: catch the error, log it, pass through.

## Our React views

React 19, TanStack Router (file routes, `routeTree.gen.ts` is generated and untracked), tRPC
over IPC, Tailwind/shadcn. Settings pages use `SettingsCheckbox` / `SettingsSelect`, as in
`routes/_settings/player/general.tsx`.

## Audio (planned, phase D)

The design is one audio engine in the page world: one `AudioContext` and a fixed, ordered chain
of stages (normalization → EQ → spatial → karaoke → pitch → dynamics → fade → analyser →
output device). When every stage is off it disconnects completely. See roadmap §7.

## Where new code goes (quick guide)

| You're adding… | Put it in… |
|---|---|
| Something that changes YouTube's page, player or audio | a page-world plugin in `src/renderer-plugins/youtube/` |
| A background service, OS feature, file or network work | a provider in `src/main/trpc/routers/<name>/` |
| A settings page or our own UI | `src/renderer/src/routes/` |
| Logic shared by main and page | `src/shared/` (keep it pure and unit-testable) |
| A ported file from another project | same places, with the header from `docs/REUSE.md` |

Every feature also needs a page in `docs/features/`. Start from `_TEMPLATE.md`.
