<p align="center">
  <img src="apps/maestro/build/icon.svg" alt="" width="112" height="112" />
</p>

<h1 align="center">Maestro</h1>

<p align="center">
A Windows music player for your own YouTube Music account: no ads, a real audio lab, Apple Music-style lyrics and themes you control.
</p>

<p align="center">
<b>Forked from <a href="https://github.com/Venipa/ytmdesktop2">Venipa/ytmdesktop2</a></b>
</p>

---

> [!NOTE]
> Maestro is a fork of [**Youtube Music for Desktop (ytmdesktop2)**](https://github.com/Venipa/ytmdesktop2) by [Venipa](https://github.com/Venipa). See [Credits](#credits). It is an independent project, so please report Maestro bugs here and not to the original repo.

> [!IMPORTANT]
> **Pre-release.** Download the latest `.exe` installer from [Releases](https://github.com/grostel018/Maestro-ymusic/releases) or build from source. Only Windows is tested.

> [!WARNING]
> ⚠️ **YouTube Dependency:** Maestro integrates with YouTube Music's web interface. If YouTube changes their website structure, APIs, or page layout, Maestro may break until updated. This is an unofficial, community-maintained project — not affiliated with or endorsed by Google, YouTube, or Venipa.

---

## 📺 Demo Video

https://github.com/user-attachments/assets/393a77d3-7218-4ff9-a631-331adbd926d2

---

## 🎵 Welcome to Maestro

If you love YouTube Music's library but hate the bare-bones official desktop app, Maestro is built for you. It's an open-source, feature-packed desktop music workstation designed for true music lovers.

---

## 📸 Feature Showcase

| | | | | |
|:---:|:---:|:---:|:---:|:---:|
| <img width="240" alt="Audio Lab" src="https://github.com/user-attachments/assets/69506f5d-ecbe-4943-9503-7f7e6597d692" /><br><b>Audio Lab & Equalizer</b> | <img width="240" alt="Karaoke Mode" src="https://github.com/user-attachments/assets/5fed08de-43a9-421f-a795-d19a882c5e3b" /><br><b>Full-Screen Karaoke</b> | <img width="240" alt="Video Controls" src="https://github.com/user-attachments/assets/7970fe9b-2716-4249-9df2-3f2d7925d973" /><br><b>True Video Mode</b> | <img width="240" alt="Music Facts" src="https://github.com/user-attachments/assets/8fbd39c0-f27f-4762-83b5-29b41ba03a2c" /><br><b>Artist Facts & Last.fm</b> | <img width="240" alt="Theme Palettes" src="https://github.com/user-attachments/assets/89489214-5edc-4c91-81dd-6da2249a14b7" /><br><b>Dark Palettes & Themes</b> |
| <img width="240" alt="UI View 1" src="https://github.com/user-attachments/assets/e993da1b-b766-4a0e-984d-f251c5df3ae1" /><br><b>Library & Playlists</b> | <img width="240" alt="UI View 2" src="https://github.com/user-attachments/assets/4c5f8636-6544-40f6-aa60-16eb5cbaa953" /><br><b>Queue & Controls</b> | <img width="240" alt="UI View 3" src="https://github.com/user-attachments/assets/26484dfe-37c8-40bf-80f7-fac1612b5542" /><br><b>Now Playing View</b> | <img width="240" alt="UI View 4" src="https://github.com/user-attachments/assets/2bac68d7-45a7-4944-9c24-afdb64982b70" /><br><b>Settings & Customization</b> | <img width="240" alt="Overview" src="https://github.com/user-attachments/assets/1e8714ce-33a2-4673-bc5e-e311c9fe8d4d" /><br><b>Full App Overview</b> |

---

## Features

### Listening

- **No ads, no Premium needed.** Three layers: network blocking, removing ads from YouTube's responses, and a fallback that skips any ad that still gets through. Premium upsells are hidden too.
- **One-click Song/Video switch** (`V`). Keeps your position and finds the song version of a music video, or the video of a song, when YouTube doesn't offer one.
- **Video controls.** Quality, speed, captions, loop, picture-in-picture, theater and full screen, with YouTube's keyboard shortcuts.
- **SponsorBlock for music videos.** Skips non-music parts, with an Undo and an off switch.
- **Game mode.** While a game or another app is in front, Maestro lowers its own priority and keeps the music playing.

### Audio lab

- **Output device** picker, with a fallback when a device is unplugged.
- **Equalizer:** 10-band and parametric, 13 presets, your own presets, and [AutoEq](https://github.com/jaakkopasanen/AutoEq) headphone profiles.
- **Spatial:** crossfeed, stereo width, virtual surround and 8D.
- **Dynamics:** loudness normalization, compressor and 1% volume steps on the mouse wheel.
- **Vocal reduction and pitch shift** of ±6 semitones.
- **Transitions:** crossfade (fade out and in), skip silence and a sleep timer.
- **Visualizer**, and a live view of which effects are on.

Every effect can be switched off. With all of them off, audio plays straight through without the engine.

### Lyrics and song info

- **Apple Music-style lyrics:** large current line, dimmed and softly blurred neighbours, word-by-word fill, click a line to seek, and text size controls.
- **A glow in the song's color** that pulses with the bass, and a per-song timing nudge when lyrics run early or late.
- **Full-screen karaoke** (`Shift+K`) with vocal reduction.
- **About panel:** short cards on the song and artist from Genius, Wikipedia, MusicBrainz and Last.fm.
- **Your stats:** hours listened, top songs and top artists, stored only on your computer.

### Look

- **16 dark palettes,** a custom or song-colored accent, corner styles, and theme import and export (`.ytmdtheme.json`).
- **Backgrounds:** blurred song artwork, the playing video, the song's color, or plain.
- **Title bar** with back, forward, search and a now-playing pill.

### From YouTube Music and ytmdesktop2

Your library, playlists, queue and comments come from YouTube Music itself. Last.fm scrobbling, Discord Rich Presence, the tray view, OBS overlays and Stream Deck support come from ytmdesktop2. Maestro reworks sign-in: Google uses a normal window, with an optional import from Firefox, and Last.fm connects in-app. Links use the `maestro://` scheme.

## Known gaps

- Open bug: some music videos show a black picture.

The full backlog is in [`IMPROVEMENTS.md`](./IMPROVEMENTS.md).

## Installation

Download **`maestro-0.0.0-setup.exe`** from the [Releases page](https://github.com/grostel018/Maestro-ymusic/releases).

Alternatively, build from source (Node.js 24.14+ and pnpm 11+):

```bash
git clone https://github.com/grostel018/Maestro-ymusic.git
cd Maestro-ymusic
.\setup.ps1
```

Or manually:

```bash
pnpm install
```

Copy `apps/maestro/.env.local.example` to `apps/maestro/.env.local` (all tokens are optional). Then run:

```bash
pnpm dev
```

## Contributing

| Read this | For |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Working rules |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | How the app fits together |
| [`docs/TESTING.md`](./docs/TESTING.md) | Unit, smoke and full test runs |
| [`docs/features/`](./docs/features) | One page per feature |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Why things are the way they are |
| [`docs/REUSE.md`](./docs/REUSE.md) | Every outside source and what was taken from it |

Commits follow Conventional Commits with a scope, such as `feat(lyrics): ...`.

## Credits

**Maestro exists because of [ytmdesktop2](https://github.com/Venipa/ytmdesktop2) by [Venipa](https://github.com/Venipa) and [its contributors](https://github.com/Venipa/ytmdesktop2/graphs/contributors).** Its app, plugin system, lyrics providers and integrations are the base everything here is built on. If you find Maestro useful, please give the original project a star.

Thanks also to:

- [Pear Desktop](https://github.com/pear-devs/pear-desktop), formerly th-ch/youtube-music, whose plugins shaped many features here. Code ported from it: Copyright (c) th-ch, MIT License.
- [ytmdesktop](https://github.com/ytmdesktop/ytmdesktop), which inspired ytmdesktop2 itself.
- [Ghostery adblocker](https://github.com/ghostery/adblocker) (MPL-2.0) for network ad blocking.
- [AutoEq](https://github.com/jaakkopasanen/AutoEq) (MIT) for headphone profiles.
- [spicetify-themes](https://github.com/spicetify/spicetify-themes) (MIT) for palette colors.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for the Firefox cookie import approach.
- [Metrolist](https://github.com/MetrolistGroup/Metrolist) for feature ideas.
- The services behind the lyrics and facts: [Better Lyrics](https://github.com/better-lyrics/better-lyrics), Unison, [LRCLIB](https://lrclib.net), [SponsorBlock](https://github.com/ajayyy/SponsorBlock), [Last.fm](https://www.last.fm), [Genius](https://genius.com), [Wikipedia](https://www.wikipedia.org) and [MusicBrainz](https://musicbrainz.org).

The complete list, with pinned versions and licenses, is in [`docs/REUSE.md`](./docs/REUSE.md).

## License

[CC0 1.0](./LICENSE), the same as ytmdesktop2. Third-party code keeps its own license, as listed in [`docs/REUSE.md`](./docs/REUSE.md).

## Disclaimer

Maestro is an unofficial project and isn't affiliated with or endorsed by Google, YouTube or Venipa. YouTube and YouTube Music are trademarks of Google LLC.
