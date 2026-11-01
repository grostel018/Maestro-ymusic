# Fork identity (runs alongside the upstream app)

**Status:** shipped (phase 1, 2026-10-25)

## What it does
Maestro installs and runs **next to** the upstream YouTube Music Desktop app without
touching it. It has its own settings, sign-in, link scheme and executable. Settings → About links
to the original project and credits its author.

| | Upstream | This fork |
|---|---|---|
| App id | `net.venipa.ytmdesktop` | `com.maestro.ymusic` |
| Profile folder | `%APPDATA%\ytmdesktop2` | `%APPDATA%\ytmdesktop2-plus` (dev: `ytmdesktop2-dev`); old names kept so settings and sign-ins survive the rename |
| Link scheme | `ytmd://` | `maestro://` |
| Executable | `ytmdesktop.exe` | `maestro.exe` |
| Auto-update | upstream releases | **off** (`FORK.updatesEnabled = false`) |

## How it works
- **One place for the identity.** Everything is in `src/shared/fork.ts`; `electron-builder.yml`
  and `fork.test.ts` check they agree.
- **The profile folder is set before any store opens.** `src/main/infra/userDataBootstrap.ts`
  is the first import of `main.ts`.
  - `--user-data-dir` overrides it, which the bench uses.
  - At startup the app logs an error if any store file ends up outside the profile folder.

## Tests
- Unit:
  - `src/main/infra/userDataPath.test.ts`
  - `src/shared/fork.test.ts`
- Bench:
  - `s1` (profile honored)
  - `s15` (no flag: settings land in the fork folder, upstream folders untouched)

## Your keys
Last.fm and Genius keys go in `apps/ytmdesktop2/.env.local`, which is gitignored:
- `VITE_LASTFM_API`
- `VITE_LASTFM_SECRET`
- `VITE_GENIUS_TOKEN`

They're baked into builds, so don't share installers built from your folder.
