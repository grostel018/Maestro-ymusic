# Game mode

**Status:** shipped (2026-10-30)
**Area:** `gameMode` (main), `light-mode` (page) · **Settings page:** Settings → Generic · **Default:** on

## What it does
While another app or a game is in front, the app steps back so the game gets the CPU and GPU. The music keeps
playing without stutter.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `app.gameMode` | `true` | Game mode on |

## How it works
- `src/main/trpc/routers/gameMode/service.ts` watches the main window:
  - **background** (not focused for 3 s): the GPU, UI and helper processes go to below-normal priority
    (`os.setPriority`). The YouTube Music renderer and the audio service keep normal priority.
  - **hidden** (minimized or in the tray): also the page's light mode (`light-mode.renderer.ts`: Video mode decodes
    at 144p; the stored quality preference is put back on return) and Blink's in-memory caches are freed
    (`webFrame.clearCache()` from the view's preload).
  - **active** (focused): everything back to normal.
- Built here (no reuse): it's window and process plumbing.

## Performance and safety
Nothing runs while the window is focused. Priorities are restored on focus and on quit.

## Known limits
- It can't trim RAM the page holds for YouTube Music itself; it frees caches and video decoding, not the page.
- A game in a borderless window on another monitor still counts as "in front", which is what you want.
