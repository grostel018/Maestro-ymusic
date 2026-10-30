# Themes: palettes, accent, corners and backgrounds

**Status:** shipped (phase E1, E2, 2026-10-30)
**Settings page:** Settings → Appearance → Themes · **Default:** YouTube Music palette, palette accent, soft corners, song artwork

## What it does
- **16 palettes:** YouTube Music, Pure black, Dracula, Nord, Catppuccin Mocha, Gruvbox, Tokyo Night, Rosé Pine,
  Solarized Dark, Monokai, Everforest, Kanagawa, Ayu Dark, GitHub Dark, Sakura, Ocean.
- **Accent:** the palette's, the playing song's color, or any color.
- **Corners:** square, soft, round (covers and the player).
- **Import/export** a `.ytmdtheme.json` (`name`, `base`, `surface`, `text`, `subtext`, `accent`, `radius`).
- **Backgrounds:** song artwork, plain, **video ambient** (the playing video, blurred, behind everything) and
  **song color** (a gradient from the song's main color).

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `themes.look` | `{ palette: "youtube", accent: "palette", radius: "soft", imported: null }` | The look |
| `themes.background` | `artwork` | `artwork`, `plain`, `video`, `color` |

## How it works
- `src/shared/theme/look.ts`: palettes, and the CSS that points YouTube Music's own color variables
  (`--ytmusic-*`, `--yt-spec-*`, `--paper-*`) at our tokens. Injected by the themes service (slot `look`).
- The window surface (`chrome/surface.scss`) and the title bar (`renderer/src/lib/surface.ts`) use the palette's
  base, so they still meet without a seam.
- Video ambient: `ambient.renderer.ts` samples the video 4 times a second into a 32 × 18 canvas, blends it into the
  last frame and shows it blurred; it stops while hidden, in Song mode and when paused (the artwork stays under it).
  Idea from pear-desktop@7c55260:`src/plugins/ambient-mode` (MIT).
- Palette colors follow the editor themes' spicetify ports (MIT); the variable mapping is ours.

## Known limits
- Dark palettes only; YouTube Music's light mode is out of scope.
- A YouTube Music redesign can rename its color variables; the palette then stops reaching those parts.
