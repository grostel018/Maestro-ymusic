export type Check = { area: string; check: string; evidence: string[] };

/**
 * One row per bench scenario. A row is ticked only when every evidence id passed in the last run.
 * Perf rows (pNN) mean "measured and recorded" except p7, the only hard-fail perf scenario.
 * Later tasks append their own rows when they add scenarios.
 */
export const CHECKS: Check[] = [
	{ area: "Boot", check: "The production build boots into music.youtube.com on an isolated profile", evidence: ["s1"] },
	{ area: "Window layout", check: "Toolbar and YouTube views match the window after setSize, maximize and unmaximize", evidence: ["s2"] },
	{ area: "Window layout", check: "YouTube Music's HTML fullscreen fills the screen without the toolbar and restores on exit", evidence: ["s3"] },
	{ area: "Window layout", check: "HTML fullscreen started from a maximized window returns to maximized", evidence: ["s3b"] },
	{ area: "Performance", check: "Home idle CPU over 10 s is measured and recorded", evidence: ["p1"] },
	{ area: "Performance", check: "Frame times while playing at 1500x800 are measured and recorded", evidence: ["p2"] },
	{ area: "Performance", check: "Frame times while playing maximized are measured and recorded", evidence: ["p3"] },
	{ area: "Performance", check: "Frame times while playing in YouTube Music's HTML fullscreen are measured and recorded", evidence: ["p3b"] },
	{ area: "Performance", check: "Resize sweep from 1000 to 1600 px is measured and the views follow the window", evidence: ["p4"] },
	{ area: "Performance", check: "Views follow the window after entering and leaving fullscreen", evidence: ["p5"] },
	{ area: "Performance", check: "CPU while paused and minimized for 60 s is measured and recorded", evidence: ["p6"] },
	{ area: "Playback", check: "Playback keeps advancing while the window is minimized (at least 100 s in 120 s)", evidence: ["p7"] },
];
