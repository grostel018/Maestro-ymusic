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
	{ area: "Themes / performance", check: "The player page uses a pre-blurred artwork with no full-page backdrop-filter or blur() by default", evidence: ["s4"] },
	{ area: "Themes / performance", check: "themes.glass restores the full-page backdrop-filter", evidence: ["s4b"] },
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
];
