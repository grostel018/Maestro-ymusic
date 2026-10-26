# Window background

**Status:** shipped (2026-10-26)
**Settings page:** Settings → Appearance → Themes · **Default:** Song artwork

## What it does
The whole window is one surface: title bar, side panel, top bar, page, player page and player bar.
The surface is either:
- **Song artwork:** a soft blur of the playing song's cover that changes with the song,
- **Plain dark:** one flat color.

The top and player bars use the same surface with a light tint. Content that scrolls under them
blurs.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `themes.background` | `artwork` | `artwork` or `plain` |
| `themes.enabled` | `true` | "Theme styling": rounded covers, cleaner player bar and queue. The background applies either way. |

The old `themes.thumbnailBackground`, `themes.blur` and `themes.glass` toggles are migrated:
- a thumbnail background that was off becomes `plain`,
- the other two are removed.

## How it works
- **Page:** `src/main/trpc/routers/themes/assets/chrome/surface.scss`. It's compiled once per
  mode and injected after the theme, so a theme can't punch holes in it.
  - `body::before` holds the artwork layer, in window coordinates: a 100vw square, shifted up
    25vw, starting under the title bar.
  - YouTube's surfaces are transparent.
  - The browse page is hidden (`opacity: 0`) while the player page is open.
  - Home's hero image is hidden in artwork mode.
- **Artwork:** `src/shared/artwork/blur.ts` turns the cover into a 96 px pre-blurred image. Nothing
  blurs a full-size image per frame.
- **Title bar:** `src/renderer/src/lib/surface.ts` paints the same image with the same geometry,
  veil and bar tint, so title bar and page meet without a seam.

## Tests
- Unit: `src/main/trpc/routers/settings/themesMigration.test.ts`, `src/shared/artwork/crop.test.ts`.
- Bench:
  - `s4`: artwork behind the page and in the title bar, no full-page backdrop-filter, browse page
    hidden under the player.
  - `s4b`: plain paints no artwork, and switching to artwork applies live.

## Known limits
- Before anything has played, artwork mode shows the plain color.
- Black bars burned into a music video's file stay visible.
- In windows taller than ¾ of their width, the artwork doesn't reach the bottom; the song's accent
  color fills the rest.
