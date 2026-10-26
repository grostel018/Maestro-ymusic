# Visualizer

**Status:** shipped (phase D7, 2026-10-26)
**Area / plugin id:** `visualizer` · **Settings page:** Settings → Player → Audio → Visualizer · **Default:** off

## What it does
Bars or a wave over the bottom of the open player, moving with the music.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `audio.visualizer.enabled` | `false` | Visualizer on |
| `audio.visualizer.style` | `bars` | `bars` or `wave` |

## How it works
`visualizer.renderer.ts` draws on a canvas from the engine's analyser tap (48 log-spaced bars, `dsp.logBins`).
Idea from pear-desktop@7c55260:`src/plugins/visualizer` (MIT). Butterchurn (Milkdrop) isn't included: it needs
a new dependency and WebGL (backlog row 66).

## Performance and safety
At most 30 fps, and only while the player page is open and the window visible; otherwise the loop stops and
the canvas is removed. p10 measures it on: frame p95 5.1 ms.

## Tests
- Unit: `audio-engine/dsp.test.ts` (bar ranges)
- Bench: `s30`, `p10`

## Known limits
- Not yet in the Now Playing view (phase F).
