export type Check = { area: string; check: string; evidence: string[] };

/**
 * One row per bench scenario. A row is ticked only when every evidence id passed in the last run.
 * Perf rows (pNN) mean "measured and recorded" except p7, the only hard-fail perf scenario.
 * Later tasks append their own rows when they add scenarios.
 */
export const CHECKS: Check[] = [
	{ area: "Boot", check: "The production build boots into music.youtube.com on an isolated profile", evidence: ["s1"] },
	{ area: "Boot", check: "Launched without --user-data-dir, settings, credential and auth stores land in the fork folder and the upstream folders stay untouched", evidence: ["s15"] },
	{ area: "Window layout", check: "Toolbar and YouTube views match the window after setSize, maximize and unmaximize", evidence: ["s2"] },
	{ area: "Window layout", check: "YouTube Music's HTML fullscreen fills the screen without the toolbar and restores on exit", evidence: ["s3"] },
	{ area: "Window layout", check: "HTML fullscreen started from a maximized window returns to maximized", evidence: ["s3b"] },
	{ area: "Window layout", check: "Quitting during HTML fullscreen saves the pre-fullscreen state: a maximized window relaunches maximized, a 1200x700 one at 1200x700", evidence: ["s14", "s14b"] },
	{ area: "Themes / performance", check: "One surface: pre-blurred artwork behind page and title bar, no full-page backdrop-filter, browse page hidden under the player", evidence: ["s4"] },
	{ area: "Themes", check: "Background 'plain' paints no artwork; switching to 'artwork' applies live", evidence: ["s4b"] },
	{ area: "Performance", check: "Home idle CPU over 10 s is measured and recorded", evidence: ["p1"] },
	{ area: "Performance", check: "Frame times while playing at 1500x800 are measured and recorded", evidence: ["p2"] },
	{ area: "Performance", check: "Frame times while playing maximized are measured and recorded", evidence: ["p3"] },
	{ area: "Performance", check: "Frame times while playing in YouTube Music's HTML fullscreen are measured and recorded", evidence: ["p3b"] },
	{ area: "Performance", check: "Resize sweep from 1000 to 1600 px is measured and the views follow the window", evidence: ["p4"] },
	{ area: "Performance", check: "Views follow the window after entering and leaving fullscreen", evidence: ["p5"] },
	{ area: "Background / power", check: "Minimized: the toolbar view reports hidden and YouTube playback keeps advancing", evidence: ["s9"] },
	{ area: "Background / power", check: "The tray view keeps background throttling on and still shows the current track, including a change made while it was hidden", evidence: ["s16"] },
	{ area: "Background / power", check: "A power-save blocker is held only while music plays", evidence: ["s10"] },
	{ area: "Background / power", check: "ignore-gpu-blocklist is off by default and the backgrounding switches match the measured decision", evidence: ["s11"] },
	{ area: "Performance", check: "CPU while paused and minimized for 60 s is measured and recorded", evidence: ["p6"] },
	{ area: "Playback", check: "Playback keeps advancing while the window is minimized (at least 100 s in 120 s)", evidence: ["p7"] },
	{ area: "Bench", check: "Settings seeded through launchApp survive startup migrations", evidence: ["s13"] },
	{ area: "Ad block", check: "Ad and tracker requests fail with ERR_BLOCKED_BY_CLIENT, every blocked URL is logged, watch-history pings are not blocked, the count rises and playback advances", evidence: ["s5"] },
	{ area: "Ad block", check: "Ad payloads are pruned from YouTube's responses: no ad keys in the player response and no ad shows for 60 s", evidence: ["s6"] },
	{ area: "Ad block", check: "An ad-showing player is muted at 16x within 1 s and both are restored when the ad ends, counted as skipped", evidence: ["s7"] },
	{ area: "Ad block", check: "Premium upsell elements are hidden while hideUpsells is on and shown when it is off", evidence: ["s8"] },
	{ area: "Ad block", check: "The ad block settings page shows the five switches with their saved values, a blocked-count line, and restart notes only where a restart is needed", evidence: ["s12"] },
	{ area: "Sign-in", check: "The Google sign-in window is a normal window (not modal, not always on top, resizable), detects Google's browser rejection, and retries with the other browser identity", evidence: ["s17"] },
	{ area: "Sign-in", check: "Import sign-in from Firefox reads the profile Firefox really uses and copies only its youtube.com / google.com cookies into the app", evidence: ["s18"] },
	{ area: "Sign-in", check: "Last.fm connects through an in-app approval window with one token (no sign-in loop) and stays connected after a restart", evidence: ["s19"] },
	{ area: "Playback", check: "The Song/Video switch and player-bar button are always visible; V toggles 5× without pausing or restarting; song mode plays the song or shows the cover and the choice is saved", evidence: ["s20"] },
	{ area: "Playback", check: "Song mode on a music video finds and plays its song near the same position, with its square cover, and Up next keeps its length", evidence: ["s21"] },
	{ area: "Playback", check: "Video mode on a song switches to its music video, or disables the Video button", evidence: ["s22"] },
	{ area: "Playback", check: "Video controls show on hover; speed, quality (saved), captions, mute, picture-in-picture, theater and fullscreen work by YouTube's keys only while the player has focus, without pausing", evidence: ["s23"] },
	{ area: "Playback", check: "The audio output menu lists devices with the system default first, switching keeps playing, and no page can open the microphone", evidence: ["s24"] },
	{ area: "Playback", check: "The player-bar speed menu sets 1.25x in Song mode and keeps playing; keep pitch flips preservesPitch and is saved", evidence: ["s25"] },
];
