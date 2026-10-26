# Google sign-in

**Status:** shipped (phase B, 2026-10-26)
**Area:** `auth` · **Default:** on

## What it does
You sign in to YouTube Music once, in a normal app window, and the app remembers it. If Google
answers "this browser or app may not be secure", the window says so and offers **Try again as
Chrome / Firefox**. It can also **import your sign-in from Firefox** (opt-in), so you don't type
your password at all.

## Settings
| Setting key | Default | Meaning |
|---|---|---|
| `googleLogin.identity` | `firefox` | Browser identity the window presents; set to the one Google accepted last |

## How it works
- **The window** (`src/main/windows/view.ts` `googleLoginPopup`) is resizable, not modal and not
  always on top.
  - Google's own pop-ups (account chooser, passkeys, 2FA) stay inside the app. They used to open
    in the default browser, which broke the flow.
- **Identities** (`src/shared/auth/googleLogin.ts`):
  - Firefox `FIREFOX_UA_VERSION` (keep it current; Windows used to send Firefox 92 from 2021).
  - Chrome, matching the real engine.
- **The classifier** (`classifyGoogleLoginPage`) watches every page.
  - **On Google's rejection page:** the state goes to `rejected`, and the notice bar
    (`renderer/src/routes/youtube/login-notice.tsx`, through the `googleLogin` tRPC router) shows
    the retry.
  - **On reaching `music.youtube.com`:** the sign-in is complete.
- **Import from Firefox** (`src/main/auth/firefoxCookies.ts`, owner decision D2):
  - It picks the profile Firefox really uses (`[Install…] Default` in `profiles.ini`).
  - It reads a temp copy of `cookies.sqlite` with Node's built-in SQLite.
  - It keeps only `youtube.com` / `google.com` cookies, and asks for confirmation before copying
    them into the app's session.
  - Local only; cookie values are never logged.
  - The approach follows yt-dlp's `--cookies-from-browser`.

## Tests
- Unit:
  - `src/shared/auth/googleLogin.test.ts`
  - `src/main/auth/firefoxCookies.test.ts`
- Bench:
  - `s17`: window, rejection, retry, against a mock page.
  - `s18`: import, against a fake Firefox profile.

## Known limits
- The window can't reuse a sign-in from another browser except through the Firefox import. It's
  a separate browser with its own cookies.
- Google may ask you to confirm it's you after an import.
- If Google rejects both identities, use the import.
