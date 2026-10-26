# Last.fm scrobbling

**Status:** sign-in fixed (phase B, 2026-10-26)
**Settings page:** Settings → Last.fm · **Default:** off until you connect

## What it does
Scrobbles what you play to your Last.fm profile. Connecting takes one approval in an app window,
and it stays connected across restarts.

## Setup: API key (once, by the owner)
The fork uses its **own** Last.fm API account; upstream's key is private to its release builds.
1. Create an API account at <https://www.last.fm/api/account/create>.
   - Application name: anything (it's what Last.fm shows on the approval page).
   - Callback URL: leave it **empty**. The app doesn't use a callback.
2. Put the values in `apps/ytmdesktop2/.env.local` (gitignored, never committed):
   ```
   VITE_LASTFM_API=<API key>
   VITE_LASTFM_SECRET=<Shared secret>
   ```
3. Rebuild. The keys are baked into the build, so don't share installers built from your folder.

## How it works
1. Connect → `auth.getToken`.
2. Last.fm's "allow access" page opens **in an app window**. That's the Pear Desktop approach;
   upstream used the default browser plus a `ytmd://` callback that another installed app could
   catch.
3. The app polls `auth.getSession` until you approve, stores the session key in the encrypted
   store of the fork's profile, and closes the window.
4. Closing the window early cancels, after one last check.

**Code:** `src/main/trpc/routers/lastfm/service.ts` and `src/main/lib/lastfm/client.ts`. The base
URLs go through `apiBase` (mockable in the bench).

## Tests
- Bench `s19`, against a mocked Last.fm, checks:
  - the approval page is in-app and carries the token, with no callback link,
  - one token is requested (no loop),
  - you stay connected after a restart.

## Known limits
- The app window has its own cookies, so you sign in to Last.fm there once, even if your
  browser is already signed in.
