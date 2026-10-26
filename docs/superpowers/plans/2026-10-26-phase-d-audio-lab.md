# Phase D: audio engine and audio lab

**Status:** in progress (2026-10-26). From roadmap §7. Owner decisions: D1 (GPL code allowed), D3 (real
pitch shift if feasible, else a fallback).

## Rulings made at phase start
- **One `MediaElementSource` is forever.** Once the engine routes a `<video>` through Web Audio, the element
  cannot go back to its native output. So the engine attaches only when the first stage turns on. When every
  stage is off again it wires source → output directly (no nodes in between): that is the "plays natively"
  state from the roadmap, at the cost of a running `AudioContext`.
- **Output device moves to the context.** With the engine attached, `AudioContext.setSinkId` picks the device;
  `audio-output.renderer.ts` hands its resolved sink to the engine and keeps `HTMLMediaElement.setSinkId` only
  while the engine is detached.
- **Pitch (D3): a delay-line pitch shifter built from Web Audio nodes** (two sawtooth-modulated delay lines,
  cross-faded; the classic granular "Jungle" design). It needs no AudioWorklet, so YouTube Music's CSP and Trusted
  Types can't block it, and it costs a few nodes. The SoundTouch worklet stays in the backlog if quality is not
  enough.
- **Crossfade (D5): fade out and fade in on the engine's fade stage.** Pear's true overlap plays the next track
  through Howler from a deciphered stream URL in main; that is fragile and doubles the network. Not taken.
- **Visualizer (D7): built-in canvas bars and wave** on the analyser tap, lazy, 30 fps, stopped when hidden.
  Butterchurn (Milkdrop) needs a new dependency and WebGL; it goes to the backlog.
- **AutoEq is fetched by main** (trpc `audio.autoeqSearch` / `audio.autoeqLoad`), not by the page, since the YouTube
  Music page's CSP decides what it may fetch. Cached in `userData/autoeq/`. Base URL overridable under the bench
  (`YTMD_E2E_API_AUTOEQ`).

## Settings (`audio.*`, one migration)
`audio.eq` (enabled, mode graphic|parametric, preset, bands[10], filters[], preamp, autoeq {name, preamp,
filters}), `audio.spatial` (crossfeed off|light|medium|strong, width %, surround, rotate, rotateSpeed),
`audio.dynamics` (normalize, compressor off|gentle|night), `audio.transitions` (crossfade s, skipSilence),
`audio.karaoke` (enabled, amount), `audio.pitch` (semitones), `audio.visualizer` (enabled, style bars|wave),
`audio.volumeWheel`. The sleep timer is per session, not saved.

## Tasks
1. **D1 engine core** (`audio-engine/engine.ts` pure graph manager, `audio-engine.renderer.ts` page side): the
   fixed chain input → eq → spatial → karaoke → pitch → dynamics → fade → analyser → output, stages by id with
   `build/update/dispose`, error isolation with a toast, `ytmd:audio-graph` event, re-attach on element swap,
   sink on the context. Unit tests on a fake `AudioContext`. Bench `s26`.
2. **D2 equalizer** (`audio-engine/eq.ts`): 10-band graphic, parametric filters, 13 presets, user preamp,
   auto-preamp guard, AutoEq `ParametricEQ.txt` parser and fetch, A/B bypass. Unit: parser, guard. Bench `s27`.
3. **D3 spatial, D4 dynamics, D6 karaoke and pitch** (`audio-engine/spatial.ts`, `dynamics.ts`, `karaoke.ts`,
   `pitch.ts`): crossfeed, M/S width, virtual surround, 8D rotation; loudness normalization from
   `loudnessDb`, compressor presets; vocal reduction; ±6 semitone pitch. Precise volume: wheel on the player
   bar in 1 % steps with a small readout. Unit: M/S math, gain math. Bench `s28`.
4. **D5 transitions** (`audio-engine/fade.ts`, `transitions.renderer.ts`): fade out before the end and fade in on
   the next track, skip silence (−50 dB longer than 1.5 s), sleep timer (minutes or end of track, 10 s fade then
   pause). Bench `s29`.
5. **D7 visualizer + D8 Audio settings page** (`visualizer.renderer.ts`, `routes/_settings/player/audio.tsx`): one
   Audio page with output device note, equalizer (bands, presets, AutoEq search), spatial, dynamics, transitions,
   karaoke and pitch, visualizer, and the live chain view. Bench `s30`.
6. **Phase review**: `pnpm t:full`, `pnpm t:perf`, one review, docs (`docs/features/audio-*.md`, REUSE,
   DECISIONS, IMPROVEMENTS, VERIFICATION).
