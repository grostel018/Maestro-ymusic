# Offline player parity — design (2026-11-17)

Extends `2026-11-17-bugfixes-and-offline-downloads-design.md` §5, whose non-goals ("Audio Lab, lyrics, visualizer,
scrobbling in the offline player ... owner can ask later") the owner has now lifted.

## Intent

The owner, on the Downloads page today: "no repeat mode, there is no equalizer mode, there is no nothing." The
Downloads section should have "all the feature that the normal YouTube has ... in the player" — sleep timer, karaoke,
equalizer, repeat, shuffle and "pretty much all the things we have been working on the online mode." The goal is the
complete thing, **so that people with a bad connection can download and listen to their music everywhere they want.**

Success: someone on a train with no signal opens Maestro, and their music plays with the same controls, sound and
lyrics they get online. When the signal comes and goes, playback doesn't notice.

## Goals

- Every online player feature that can work offline does work offline (the map below, 39 rows).
- One setting, one behaviour: the equalizer preset, karaoke level, speed, sleep timer, etc. are the same settings
  online and offline. No second copy to keep in sync.
- Built for bad connections: what you streamed is already on disk, your favourites download themselves, downloads
  resume, and a returning connection never interrupts offline playback.
- Audio first. Video is an **option** the user can turn on per download or in settings (owner, 2026-11-17).

## Non-goals

- Replacing the online YouTube Music page with our own player (ytm-rs's model). Online stays the YTM page.
- Syncing with YouTube Music Premium's own offline library.
- Comments offline.
- Porting code from GPL or EULA projects (ytm-rs, SimpMusic, Harmony, Namida). Ideas only; code reuse follows
  `docs/REUSE.md`.

## Anti-goals (a failure even if it works)

- The offline player stops or goes silent because the connection came back (today it does, see Current state).
- Two equalizers, two sleep timers, two settings pages that drift apart.
- Background caching that makes online playback stutter on a weak connection.
- Disk filling up without the user choosing a limit.
- Breaking any roadmap §1.4 never-break rule (playback never stalls; startup never waits > 3 s on the network).

## Current state (checked in code, 2026-11-17)

- Offline player: `apps/maestro/src/renderer/src/routes/downloads.tsx`, Maestro's own React route in its own
  `WebContentsView` (`downloadsView` in `main/windows/windowManager.ts`). One `<audio>`, a queue of video ids.
  Has: play/pause, prev/next, seek, volume/mute, Play and Shuffle on an album or playlist, search, `mediaSession`.
- Downloads are audio only (`main/services/downloader/core.ts`: `bestaudio[ext=m4a]/bestaudio`, `-x`), played via
  `maestro-media://`, indexed in `userData/downloads.json`.
- **When YTM loads again, Downloads closes itself and the offline song stops** (`did-finish-load` →
  `closeDownloads`, which closes the view's webContents). On a flaky connection this repeats.
- Tray, Discord, Last.fm, stats, Stream Deck, OBS, remote and the API read the track from the YTM page through
  `main/trpc/routers/track/service.ts`; their commands (next, play, …) go to the YTM page. The offline player feeds
  none of them.
- The audio engine (`renderer-plugins/youtube/audio-engine/engine.ts`, `stages.ts`, `transitions.logic.ts`,
  `@shared/audio/*`) has no DOM dependency: deps are injected and it attaches with `setElement(HTMLMediaElement)`.
  The page glue (`audio-engine.renderer.ts`, `transitions.renderer.ts`, player-bar buttons, lyrics UI) is bound to
  the YTM page DOM.
- Lyrics are fetched online per play; nothing is stored with a download.

## Approaches

1. **Shared engine, new offline UI (picked).** The Downloads page attaches the same `AudioEngine` to its own media
   element and reads the same `audio` settings through tRPC. New React controls in the Downloads player bar mirror
   the online ones. Pure logic (queue, repeat, sleep timer, lyrics parsing) lives in shared modules both sides use.
   Trade-off: the UI is built a second time in React; the sound and settings are not.
2. **Play downloads inside the YTM page.** Rejected: the YTM page doesn't load offline, which is exactly when
   downloads matter.
3. **A separate offline player with its own copies of each feature.** Rejected: two equalizers, two sleep timers; they
   drift and every fix is made twice (an anti-goal).
4. **Our own player for online too (like ytm-rs).** Rejected: a rewrite of the whole app, far beyond this request.

The owner approved approach 1 and the phase order (2026-11-17).

## Feature map (online → offline)

Ways: **Have** (works now) · **Port** (reuse the online module) · **Build** (new) · **Save** (stored at download
time) · **Sync later** (works offline, catches up online).

| # | Online feature | Offline | Phase |
|---|---|---|---|
| 1 | Play/pause, prev/next, seek, volume, media keys | Have | — |
| 2 | Shuffle | Build: toggle in the bar (today only album/playlist button) | 1 |
| 3 | Repeat all / one | Build | 1 |
| 4 | Up next queue: see, reorder, play next, add to queue | Build | 1 |
| 5 | Endless autoplay | Build: continue from your downloads | 1 |
| 6 | Playback speed, keep pitch, `<` `>` | Port | 1 |
| 7 | Speaker (output device) | Port | 1 |
| 8 | Wheel volume, volume ratio | Port | 1 |
| 9 | Keyboard shortcuts | Build | 1 |
| 10 | 10-band equalizer, 13 presets, AutoEq | Port | 2 |
| 11 | Spatial / 8D / crossfeed | Port | 2 |
| 12 | Vocal reduction | Port | 2 |
| 13 | Pitch, compressor | Port | 2 |
| 14 | Loudness normalization | Port + Save the track's loudness at download | 2 |
| 15 | Crossfade, skip silence | Port | 2 |
| 16 | Sleep timer (minutes, end of track) | Port | 1 |
| 17 | Visualizer | Port | 2 |
| 18 | Synced lyrics, romanization, translation | Save lyrics at download; Port the view | 3 |
| 19 | Full-screen karaoke (Shift+K), lyrics beat | Port | 3 |
| 20 | Facts panel | Save a copy at download, else online only | 3 |
| 21 | Comments | Online only | — |
| 22 | Song / Video switch, video controls | Build (optional video download) | 5 |
| 23 | Video quality | Build: choose at download | 5 |
| 24 | SponsorBlock | Save skip points at download | 5 |
| 25 | Themes, palettes, light mode | Check the Downloads page follows them | 1 |
| 26 | Artwork background, track colours, ambient | Port | 2 |
| 27 | HD artwork | Have | — |
| 28 | Tray, Discord, Stream Deck, OBS, remote, API | Build: offline player reports to and obeys them | 1 |
| 29 | Last.fm scrobbling | Sync later (Last.fm accepts plays up to 14 days old) | 1 |
| 30 | Your stats | Count offline plays | 1 |
| 31 | Like / dislike | Sync later | 4 |
| 32 | Local playlists + import | Play downloaded songs in them; download a whole local playlist | 4 |
| 33 | Share link | Have (it's a URL) | — |
| 34 | Ad block, "Video paused" fix, sign-in | Not needed offline | — |
| 35 | Keep what you stream (from Harmony, Zuno) | Build: songs played online are downloaded in the background into a cache with a user-set size limit | 4 |
| 36 | Smart downloads (from SimpMusic) | Build: most-played and Liked songs download themselves | 4 |
| 37 | Queue kept across restarts, next song preloaded (Namida, ytm-rs) | Build | 1 |
| 38 | Sleep timer after N songs (Namida) | Build | 1 |
| 39 | Lyrics: click a line to seek, per-song timing offset, add your own (ytm-rs, SimpMusic) | Build | 3 |

Also phase 4: downloads resume after a dropped connection; storage limit and audio quality settings.

## Decisions made with the owner

- Audio first; video is an opt-in per download or in settings, its own phase (5).
- The complete list above, including the five ideas from other clients (#35–#39).
- Approach 1 and this phase order: 1 player basics + sleep timer + integrations, 2 Audio Lab, 3 lyrics and karaoke,
  4 bad-connection features, 5 optional video.

## Design notes (my calls, for the builder)

- **Offline playback survives a returning connection.** When YTM finishes loading again, Downloads closes itself
  only if the offline player never started anything since it opened (today's behaviour for that case). If it has a
  queue — playing or paused — Downloads stays open, YTM loads behind it, and a "You're back online · Go to YouTube
  Music" bar appears. Leaving Downloads pauses the offline player first (one player at a time, as today), but the
  view is kept (hidden) so the queue and position survive; starting YTM playback pauses the offline player.
- **One "active player".** Main tracks which player is active: the one that last started playing. It stays active
  while paused until the other one plays. Track info for tray, Discord, Last.fm, stats, API, OBS and Stream Deck
  comes from the active one; their commands (play, pause, next, seek, volume…) go to the active one. The Downloads
  page pushes its state through a new tRPC call into the track service rather than a parallel service.
- **Offline tracks in the existing track shape.** The API and remote schema only gain an optional
  `source: "online" | "offline"` field; nothing is removed or retyped, so existing clients keep working. Artwork for
  outside consumers is the public `https://i.ytimg.com/vi/<id>/…` thumbnail (works whenever they are online, and
  Discord/OBS/remote need the network anyway); inside the app the saved art is used. Like state is the last known
  one. Share link is the normal `music.youtube.com/watch?v=<id>` URL.
- **Sleep timer and speed are per player, settings are shared.** Each player runs its own timer and speed through
  the shared `src/shared/player/` logic; a timer set online doesn't carry into Downloads. What is shared is the
  stored settings (audio lab, keep-pitch, sleep-timer defaults). Moving live timer state into main would mean
  rewriting working online code for an edge case.
- **Endless autoplay offline** follows the existing online autoplay setting (no new switch). When the queue ends it
  continues with downloads not yet played this session: same artist first, then the rest, shuffled; it never
  repeats a song until all have played.
- **Shared pure logic** goes in `src/shared/player/` (queue order, repeat/shuffle, sleep timer state) and is
  unit-tested once; the YTM page keeps using YTM's own queue, so only the offline side uses the queue module.
- **Engine in Downloads**: a second `AudioEngine` instance in the Downloads renderer with the same `STAGES`, fed by
  the `audio` settings query and subscription. Page-only hooks (YTM loudness, YTM gestures) get offline equivalents
  (saved loudness, the page's own click).
- **Save at download** (phases 2–5) extends the index entry: `loudnessDb`, `lyrics` (synced text + source),
  `sponsorSegments`, `facts`. Old entries without them still play; a "refresh extras" action fills them in when online.
- **Keep what you stream** uses the same yt-dlp downloader with a low-priority queue that only runs while nothing
  is streaming or when bandwidth is idle, into a separate cache folder evicted least-recently-played first.
- Each phase meets roadmap §1.3: can be switched off where it's a feature, settings + migration, unit tests, one
  smoke scenario, `docs/features/<name>.md`, a `docs/REUSE.md` entry.

## Left to the builder

Exact UI layout of the offline player bar and panels (mirror the online bar's look); file split inside
`routes/downloads/`; tRPC names; cache eviction details; how the video file is muxed and named.
