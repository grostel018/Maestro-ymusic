# Window layout and fullscreen

**Status:** shipped (phase 1, 2026-10-25; settle fix 2026-10-26)
**Area:** `windows` · **Default:** always on

## What it does
The YouTube view and the toolbar follow the window instantly when you resize, maximize or go
fullscreen. YouTube Music's own fullscreen button fills the screen with the toolbar hidden, and
leaving it restores the window to how it was.

## How it works
- **One layout path.** `WindowManager.applyLayout()` (`src/main/windows/windowManager.ts`) is the
  only place that sizes views.
  - The bounds math is pure: `computeViewBounds` in `src/main/windows/layout.ts`.
  - It runs synchronously on `resize`.
  - It re-checks 50 ms and 250 ms after maximize, unmaximize, fullscreen and `resized`, because
    Windows can settle a frameless window's size late.
- **HTML fullscreen.** `enter-html-full-screen` remembers the window state
  (`createFullscreenRestore`), sets OS fullscreen and drops the toolbar.
  `leave-html-full-screen` restores the window.
- **Saving.** Quitting during fullscreen saves the pre-fullscreen bounds, never the
  monitor-sized ones (`nextSavedWindowState`).

## Performance
Before: views trailed the window by about 97 ms. After: about 2 ms (spec §8, p4/p5).

## Tests
- Unit: `src/main/windows/layout.test.ts`
- Bench:
  - `s2` resize/maximize (smoke)
  - `s3` / `s3b` HTML fullscreen (smoke: s3)
  - `s14` / `s14b` quit during fullscreen
  - `p4` / `p5` perf

## Known limits
- Pressing F11 during YouTube's fullscreen leaves the toolbar hidden until you press Esc.
