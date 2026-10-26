# Notes for AI agents and collaborators

This repo is a **personal fork** of Venipa/ytmdesktop2, being turned into YTMDesktop2 Plus.
Before you change anything, read these in order:

1. `docs/superpowers/plans/2026-10-25-master-roadmap.md`: what we're building and in which
   order. **It is the source of truth.** Don't add features that aren't in it; propose them for
   §13 instead.
2. `docs/ARCHITECTURE.md`: where code goes.
3. `docs/TESTING.md`: how to test fast.
4. `docs/REUSE.md`: reuse before building, and the license rules.
5. `docs/DECISIONS.md`: why things are the way they are.

## Rules that save time and avoid breakage

- **Reuse first.** Check `docs/REUSE.md` and roadmap §3. Port from listed projects (with the
  header), don't rebuild.
- **Work phase by phase.** Write a short plan (4–6 tasks) from the roadmap, build it in order,
  and get one review at the end of the phase.
- **Test in tiers.**
  - After each edit: `pnpm t:unit`.
  - After each task: `pnpm t:smoke` (or `pnpm t:smoke <area>`, e.g. `pnpm t:smoke adblock`).
  - Only at the end of a phase: `pnpm t:full` and `pnpm t:perf`.
- **Definition of done** (roadmap §1.3):
  - can be switched off,
  - settings + migration,
  - unit tests,
  - a bench scenario + a `checks.ts` row,
  - `docs/features/<name>.md`,
  - a `docs/REUSE.md` entry,
  - no performance regression.
- **Never break** (roadmap §1.4):
  - playback never stalls or goes silent,
  - startup never waits more than 3 s on the network,
  - never touch the upstream app's profile,
  - no full-screen blur, and no loops while hidden.
- **Git:**
  - Conventional Commits with a scope (`feat(eq): …`).
  - The lefthook Biome hook must run; never `--no-verify`.
  - Work on `feature/*`, never push without the owner's OK.
  - Don't commit `services.generated.d.ts` unless a service was added.
  - Don't commit `resources/embeds/now-playing/` or `.env.local`.
- **Secrets:** `apps/ytmdesktop2/.env.local` holds the owner's Last.fm and Genius keys. Never
  print or commit them.
- **The bench only kills processes it started.** The owner runs other Electron apps.
- **Tooling:** pnpm 11.15.1, Node ≥ 24.14, Windows.
