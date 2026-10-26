# Audio output device

**Status:** shipped (phase C3, 2026-10-26)
**Where:** the speaker button in the player bar · **Default:** system default

## What it does
- Lists the system's outputs by name, with "System default" first.
- The choice applies at once without pausing, and it's kept across restarts.
- Plugging and unplugging updates the list.
- If the chosen device is gone, playback moves to the default device and a toast says so, once.
  When the device comes back, it's used again.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `player.outputDevice` | `default` | Device id, or `default` to follow the system |

## How it works
- `src/renderer-plugins/youtube/audio-output.logic.ts` (unit-tested): the menu list and the
  fallback.
- `audio-output.renderer.ts`: `enumerateDevices`, `HTMLMediaElement.setSinkId` on the player's
  element, `devicechange` for hot-plug. The audio engine (D1) will take over with
  `AudioContext.setSinkId`.
- **Permissions** (`src/main/lib/mediaPermissions.ts`): device names and speaker selection need
  Chromium's "media" permission. Electron used to grant every permission to every page, including
  the microphone and camera without a prompt. Now:
  - device listing and speaker selection are allowed only for YouTube Music and the app's own
    pages,
  - capture (microphone, camera, screen) is refused for every page,
  - other permissions are unchanged.
- **Reuse:** the approach of pear-desktop's `custom-output-device` plugin (MIT).

## Tests
- Unit: `audio-output.logic.test.ts`, `src/main/lib/mediaPermissions.test.ts`.
- Bench `s24`:
  - the menu starts with "System default",
  - choosing it keeps playing on the default sink,
  - `getUserMedia({ audio: true })` is refused.

## Known limits
- Only the player's media element follows the device. Sounds from other views (none today) would
  use the system default.
