# Equalizer

**Status:** shipped (phase D2, 2026-10-26)
**Area / plugin id:** `audio-engine` stage `eq` · **Settings page:** Settings → Player → Audio → Equalizer · **Default:** off

## What it does
- A 10-band equalizer (32 Hz to 16 kHz) with 13 presets: Flat, Bass Boost, Bass Reducer, Vocal, Treble,
  Loudness, Acoustic, Electronic, Hip-Hop, Classical, Rock, Pop, Late Night.
- Your own presets, saved by name; import and export as JSON.
- A parametric mode: up to 10 filters (peak, low shelf, high shelf) with frequency, gain and Q.
- Headphone correction: search a model, and its AutoEq profile is loaded and kept offline.
- A preamp, an automatic clipping guard, an A/B switch and a live curve.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `audio.eq.enabled` | `false` | Equalizer on |
| `audio.eq.mode` | `graphic` | `graphic`, `parametric` or `autoeq` |
| `audio.eq.preset` | `flat` | Preset id, `user:<name>` or `custom` |
| `audio.eq.bands` | ten `0` | Gains in dB (±12) |
| `audio.eq.filters` | `[]` | Parametric filters |
| `audio.eq.preamp` | `0` | User preamp in dB (−12 to +6), added to the guard |
| `audio.eq.autoeq` | `null` | The loaded headphone profile (name, preamp, filters) |
| `audio.eq.userPresets` | `[]` | Saved presets |

## How it works
- `src/shared/audio/eq.ts` (unit-tested): presets, the filters a setting stands for, biquad magnitude (Audio
  EQ Cookbook, as Web Audio implements it), the guard (lowers the level by the curve's highest point), and the
  AutoEq readers for `ParametricEQ.txt` and `results/INDEX.md`.
- Stage `eq` in `audio-engine/stages.ts`: a preamp gain and one `BiquadFilterNode` per filter, updated in place.
- AutoEq: `src/main/trpc/routers/audio/service.ts` fetches from `raw.githubusercontent.com/jaakkopasanen/AutoEq`
  (MIT) and caches in `userData/autoeq/` (the index for 7 days, profiles for good). Main fetches, not the page,
  because the YouTube Music page's CSP decides what the page may load. Under the bench,
  `YTMD_E2E_API_AUTOEQ` points it at a mock.
- Preset idea from pear-desktop@7c55260:`src/plugins/equalizer` (MIT); the values are ours.

## Performance and safety
Ten biquads at most. The curve is drawn only while the settings page is open. The guard keeps boosts from
clipping.

## Tests
- Unit: `src/shared/audio/eq.test.ts`
- Bench: `s27` (Bass Boost raises the low band against the mids at the analyser), `s27b` (AutoEq through a
  mock, with the cache)

## Known limits
- Web Audio shelves ignore Q (slope 1), so an AutoEq shelf with another Q is close, not exact.
