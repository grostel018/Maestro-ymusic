import { describe, expect, it } from "vitest";
import { cleanArtist, cleanTitle, cleanTrackForSearch } from "./normalize";

describe("cleanArtist", () => {
	it("strips channel suffixes", () => {
		expect(cleanArtist("Michael Jackson - Topic")).toBe("Michael Jackson");
		expect(cleanArtist("TheWeekndVEVO")).toBe("The Weeknd");
		expect(cleanArtist("Rick Astley")).toBe("Rick Astley");
		expect(cleanArtist("Eslabon Armado & Peso Pluma")).toBe("Eslabon Armado & Peso Pluma");
	});
});

describe("cleanTitle", () => {
	it.each([
		["Rick Astley - Never Gonna Give You Up (Official Music Video)", "Rick Astley", "Never Gonna Give You Up"],
		["Get Lucky (feat. Pharrell Williams & Nile Rodgers)", "Daft Punk", "Get Lucky"],
		["Bohemian Rhapsody (Remastered 2011)", "Queen", "Bohemian Rhapsody"],
		["Calm Down (with Selena Gomez)", "Rema", "Calm Down"],
		["Song (Lyrics) [Official Video]", "X", "Song"],
		["Song ft. Someone", "X", "Song"],
		["Never Gonna Give You Up", "Rick Astley", "Never Gonna Give You Up"],
	])("%s", (title, artist, expected) => {
		expect(cleanTitle(title, artist)).toBe(expected);
	});

	it("keeps meaningful brackets and dashes that aren't the artist", () => {
		expect(cleanTitle("Don't Stop Me Now (Live at Wembley)", "Queen")).toBe("Don't Stop Me Now (Live at Wembley)");
		expect(cleanTitle("Part 1 - Intro", "Someone")).toBe("Part 1 - Intro");
	});

	it("never returns an empty title", () => {
		expect(cleanTitle("(Official Video)", "X")).toBe("(Official Video)");
	});
});

it("cleanTrackForSearch cleans both fields", () => {
	const info = { videoId: "v", title: "The Weeknd - Blinding Lights (Official Video)", artist: "TheWeekndVEVO", durationSec: 263 };
	expect(cleanTrackForSearch(info)).toMatchObject({ title: "Blinding Lights", artist: "The Weeknd", videoId: "v" });
});
