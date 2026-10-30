# Lyrics view and karaoke

**Status:** shipped (phase F2, F6, 2026-10-30; providers from phase 1)
**Where:** the Lyrics tab of the player page; the microphone button in the player bar or Shift+K for karaoke

## What it does
- Apple Music-style lyrics: the current line large and bright, nearby lines dimmed, far ones dimmed and softly
  blurred; smooth scrolling; word-by-word fill when the provider has word timing, line fill otherwise; breathing
  dots in gaps of 4 s or more; a click on a line seeks there; the wheel scrolls freely for 2.5 s.
- Full-screen karaoke: huge centred lyrics over the blurred artwork, a vocal-reduction switch and amount (the
  audio engine's karaoke stage), Esc to leave. Playback never pauses.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `lyrics.lineStyle` | `fill` | `fill` or `highlight` |
| `lyrics.showTimeCodes` | `false` | Times next to lines |
| `lyrics.fontScale` | `1` | Text size, 0.7–2 (also the A− / A+ buttons in the view) |
| `lyrics.glow` | `song` | Light on the current line: `off`, `song` (artwork color), `accent` (theme), `custom` |
| `lyrics.glowColor` | `#ffffff` | Color for `custom` |
| `lyrics.glowBeat` | `true` | The glow pulses with the bass |

## How it works
- `lyrics/ui/apple.ts` replaces the React view: plain DOM built once per result, its own frame clock (it reads the
  video's `currentTime` each frame, so nothing crosses worlds per frame), one GPU transform for the scroll,
  positions measured on build and resize only, the fill driven by a CSS variable.
- Glow: three streaks (registered `@property` percentages, animated in CSS) are background layers clipped to the
  letters of the current line, above the fill layer (`--ytmd-al-base`), plus a `drop-shadow` halo that follows the
  glyphs. The sung word (`data-now`) shines most. `lyrics-beat.renderer.ts` (page world) reads the engine analyser's
  40–200 Hz bins at 30 fps while a glowing view is visible and writes `--ytmd-al-beat` (0–1) on the view; the CSS
  default (.3) is a steady glow. The song color is the artwork's Vibrant swatch, with fallbacks, from main.
- `lyrics/stage.ts` is the karaoke overlay; it uses the same view in a "stage" variant.
- Lowercase `k` stays play/pause; capital `K` (Shift+K) is karaoke.

## Known limits
- Romanization and translation lines are not done yet (backlog).
