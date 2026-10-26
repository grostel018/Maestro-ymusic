# Transitions and sleep timer

**Status:** shipped (phase D5, 2026-10-26)
**Area / plugin id:** `transitions` (and the engine's `fade` and `analyser` stages) · **Settings page:**
Settings → Player → Audio → Transitions; the sleep timer is the moon button in the player bar · **Default:** off

## What it does
- **Crossfade** 1–12 s: the track fades out before its end and the next one fades in.
- **Skip silence**: silence longer than 1.5 s (below −50 dB) is skipped; near a track's end it goes to the
  next track.
- **Sleep timer**: 5–90 minutes or the end of the track; it fades out over 10 s and pauses.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `audio.transitions.crossfade` | `0` | Seconds; 0 is off |
| `audio.transitions.skipSilence` | `false` | Skip silence |

The sleep timer isn't saved: it lasts for this session.

## How it works
- `audio-engine/transitions.logic.ts` (unit-tested): when the fade starts, when silence counts, what the sleep
  timer does now. `transitions.renderer.ts` drives the engine's fade gain from `timeupdate`.
- No true overlap of two tracks. Pear's crossfade (pear-desktop@7c55260:`src/plugins/crossfade`, MIT) plays the
  next track through Howler from a stream URL deciphered in main; that is fragile and doubles the network.
  Backlog row 44 keeps the idea.
- Silence detection follows pear-desktop@7c55260:`src/plugins/skip-silences` (MIT, after hark): a level held
  under a threshold for a while. The numbers are ours.

## Performance and safety
Two small timers (1 s and 250 ms) that return at once when nothing is on. A new track, a seek back from the
tail or a jump back to the start always restores the gain, so a fade can't leave the sound off.

## Tests
- Unit: `audio-engine/transitions.logic.test.ts`
- Bench: `s29` (crossfade into the next track without a stall; the sleep timer fades, then pauses)

## Known limits
- Before the engine is attached (no gesture yet), the sleep timer pauses without fading.
