# Spatial, dynamics, vocal reduction, pitch and wheel volume

**Status:** shipped (phase D3, D4, D6, 2026-10-26)
**Area / plugin id:** `audio-engine` stages `input`, `spatial`, `karaoke`, `pitch`, `dynamics`; `volume-wheel`
· **Settings page:** Settings → Player → Audio · **Default:** all off, wheel volume on

## What it does
- **Crossfeed** (light, medium, strong): a little of each side in the other ear, for headphones.
- **Stereo width** 0–200 % (mid/side).
- **Virtual surround**: the two channels placed around you with HRTF.
- **8D rotation**: the sound circles your head, at a speed you set.
- **Loudness normalization**: raises quiet tracks from YouTube's `loudnessDb`, by at most 6 dB.
- **Compressor**: Gentle or Night.
- **Vocal reduction** ("karaoke"): lowers the centre of the mix between 150 Hz and 6 kHz.
- **Pitch**: ±6 semitones without changing the speed.
- **Wheel volume**: scroll over the player bar for 1 % steps, with a readout.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `audio.spatial.crossfeed` | `off` | `off`, `light`, `medium`, `strong` |
| `audio.spatial.width` | `100` | Percent |
| `audio.spatial.surround` | `false` | Virtual surround |
| `audio.spatial.rotate` / `rotateSpeed` | `false` / `0.1` | 8D rotation, turns per second |
| `audio.dynamics.normalize` | `false` | Loudness normalization |
| `audio.dynamics.compressor` | `off` | `off`, `gentle`, `night` |
| `audio.karaoke.enabled` / `amount` | `false` / `0.8` | Vocal reduction and how much |
| `audio.pitch.semitones` | `0` | −6 to +6 |
| `audio.volumeWheel` | `true` | Wheel over the player bar |

## How it works
- Numbers in `audio-engine/dsp.ts` (unit-tested), graphs in `stages.ts`.
- Crossfeed follows Bauer's stereophonic-to-binaural idea with bs2b's three classic settings (built here, no
  code reused).
- Normalization only raises: YouTube already turns loud tracks down, so cutting again would double it. The
  `volumeRatio` plugin (the volume curve) is unchanged.
- Pitch is a delay-line granular shifter: two delay lines swept by looping ramps and cross-faded (the classic
  "Jungle" design, written here). It needs no AudioWorklet, so the page's CSP and Trusted Types can't block it.
  Decision D3 asked for SoundTouch if feasible; it stays in the backlog (row 67) in case quality isn't enough.
- Wheel volume: `volume-wheel.renderer.ts`, idea from pear-desktop@7c55260:`src/plugins/precise-volume` (MIT).

## Performance and safety
Each effect builds its nodes only while it is on. 8D moves the panners on a 20 Hz timer; a background window
slows it to 1 Hz, which only makes the motion coarser.

## Tests
- Unit: `audio-engine/dsp.test.ts`
- Bench: `s28` (each effect joins the chain without silence; vocal reduction lowers the mids by 11.6 dB on the
  test track; the wheel adds 1 %)

## Known limits
- Pitch adds about 50–100 ms of delay and some graininess on long notes.
- Vocal reduction works on centre-panned vocals only and also lowers other centre instruments.
