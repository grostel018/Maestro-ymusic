# Audio engine

**Status:** shipped (phase D1, 2026-10-26)
**Area / plugin id:** `audio-engine` · **Settings page:** Settings → Player → Audio · **Default:** every stage off

## What it does
Runs the audio lab: one Web Audio graph between YouTube Music's player and the speakers. With every effect
off, YouTube Music's sound is untouched. Effects: [equalizer](equalizer.md), [spatial, dynamics, vocal
reduction and pitch](audio-effects.md), [transitions and sleep timer](transitions.md), [visualizer](visualizer.md).

## Settings
All of them live under `audio.*` (see the pages above). The engine itself has none.

## How it works
- `src/renderer-plugins/youtube/audio-engine/engine.ts` (unit-tested on a fake `AudioContext`): one context,
  one `MediaElementSource` per `<video>`, and a fixed chain `input → eq → spatial → karaoke → pitch → dynamics
  → fade → analyser → output`. Stages are registered by id with `wants / create / update / dispose`; a stage
  that is off is skipped, not bypassed with extra nodes.
- `stages.ts` builds each stage; `dsp.ts` and `src/shared/audio/eq.ts` hold the numbers.
- `audio-engine.renderer.ts` (page world) feeds it the `audio` settings, the player's `<video>`, the track's
  `loudnessDb` and user gestures. It reports the chain as `ytmd:audio-graph` (page) and `audio:graph` (main,
  shown live on the settings page through `audio.graph`).
- **Attaching is one-way.** Web Audio can't hand an element back to its native output, so the engine waits
  until the first stage turns on. Once attached, "all off" is a direct source → output connection.
- **Gestures.** The app's autoplay policy needs a user gesture to start an `AudioContext`. The engine never
  routes the element into a suspended context (that would mute it). It asks main (`audio:gesture-needed`),
  which calls `window.__ytmdAudio.resume()` with `userGesture`; any click or key in the page works too.
- **Output device.** Once attached, `AudioContext.setSinkId` carries the device chosen in the player bar
  (`audio-output.renderer.ts` hands it over).
- Built here (no reuse): Pear's plugins each wire themselves into the graph, so their order is fragile.

## Performance and safety
- Nothing runs while no stage is on. The context uses `latencyHint: "balanced"`, so the sound stays in step
  with the picture in Video mode.
- A stage that throws is switched off with a toast ("Equalizer was turned off after an error.") and the rest
  keep playing. It's tried again when its settings change.
- p10: equalizer, compressor and visualizer on cost about 0.8 % CPU over plain playback (p9); frame p95
  unchanged.

## Tests
- Unit: `audio-engine/engine.test.ts`, `dsp.test.ts`, `src/shared/audio/settings.test.ts`
- Bench: `s26` (smoke: order, three stages on and all off, no silence over 200 ms), `p10`

## Known limits
- After the first use, the page keeps a running `AudioContext` until it reloads, even with every stage off.
