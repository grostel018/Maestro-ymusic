<h1 align="center">Maestro</h1>

<p align="center">
A Windows music player for your own YouTube Music account: no ads, a real audio lab, Apple Music-style lyrics and themes you control.
</p>

<p align="center">
<b>Forked from <a href="https://github.com/Venipa/ytmdesktop2">Venipa/ytmdesktop2</a></b>
</p>

> [!NOTE]
> Maestro is a fork of [**Youtube Music for Desktop (ytmdesktop2)**](https://github.com/Venipa/ytmdesktop2) by [Venipa](https://github.com/Venipa). See [Credits](#credits). It is an independent project, so please report Maestro bugs here and not to the original repo.

> [!IMPORTANT]
> **Pre-release.** There are no installers yet, so you build it from source. Only Windows is tested.

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

- No light mode (dark palettes only).
- No romanization or translation lines in lyrics yet.
- Open bugs: snapping the window to half the screen breaks the layout, some music videos show a black picture, and theater mode has layout issues.

The full backlog is in [`IMPROVEMENTS.md`](./IMPROVEMENTS.md).

## Build from source

You need Node 24.14 or newer, pnpm 11 (the repo pins 11.15.1), and the [GitHub CLI](https://cli.github.com/).

```bash
git clone https://github.com/grostel018/Maestro-ymusic.git
```

```bash
cd Maestro-ymusic
```

One dependency (`@venipa/xosms`) comes from GitHub Packages, so your token needs package access. Add `//npm.pkg.github.com/:_authToken=<your token>` to your user `~/.npmrc`.

```bash
gh auth login -s read:packages
```

```bash
pnpm install
```

Copy `apps/ytmdesktop2/.env.local.example` to `apps/ytmdesktop2/.env.local`. The app won't start without it. Then run:

```bash
pnpm dev
```

**Optional keys in `.env.local`:**

| Key | Used for |
|---|---|
| `VITE_LASTFM_API`, `VITE_LASTFM_SECRET` | Last.fm scrobbling and facts. Create your own API account: see [`docs/features/lastfm.md`](./docs/features/lastfm.md) |
| `VITE_GENIUS_TOKEN` | Genius "behind the song" cards |

**Desktop shortcut:** this creates a shortcut that opens the app and rebuilds it when the code has changed.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File apps/ytmdesktop2/scripts/launch.ps1 -InstallShortcut
```

Maestro has its own profile folder (`%APPDATA%\ytmdesktop2-plus`, a name kept from before the rename), so it runs next to an installed copy of ytmdesktop2 without touching it.

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
