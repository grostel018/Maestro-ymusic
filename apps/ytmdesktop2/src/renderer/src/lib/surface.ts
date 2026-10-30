import { makeBlurredArtwork } from "@shared/artwork/blur";
import { type BackgroundMode, normalizeLook, titleBarColors } from "@shared/theme/look";
import { resolveArtworkUrl } from "@shared/track/thumbnail";
import { type CSSProperties, useEffect, useState } from "react";
import { useSettingsState } from "@/hooks/use-settings";
import { useTrack, useTrackState } from "@/hooks/use-track";

const tint = (color: string) => `linear-gradient(${color}, ${color})`;

/**
 * Background for the app's title bar that continues the YouTube page's surface (chrome/surface.scss): the same
 * pre-blurred artwork in the same window-coordinate geometry (100vw square, shifted up 25vw), the same veil,
 * and the bar tint the page's top bar uses. The title bar sits at the window's top, so its coordinates are
 * window coordinates and the two meet without a seam.
 */
export function useSurfaceBackground(): CSSProperties {
	const [mode] = useSettingsState<BackgroundMode>("themes.background", "artwork");
	const [lookRaw] = useSettingsState<unknown>("themes.look", null);
	const { base, veil, tint: barTint } = titleBarColors(normalizeLook(lookRaw));
	const track = useTrack();
	const accent = (useTrackState() as { accent?: string | null } | null)?.accent || base;
	// Video ambient keeps the artwork here: the title bar has no video to sample.
	const artworkUrl = mode === "plain" || mode === "color" ? null : resolveArtworkUrl(track);
	const [blurred, setBlurred] = useState<string | null>(null);

	useEffect(() => {
		if (!artworkUrl) {
			setBlurred(null);
			return;
		}
		let current = true;
		// Keeps the previous artwork until the new one is ready, like the page does.
		makeBlurredArtwork(artworkUrl).then(
			(url) => current && setBlurred(url),
			() => current && setBlurred(null),
		);
		return () => {
			current = false;
		};
	}, [artworkUrl]);

	if (mode === "color") {
		// Same gradient as the page (chrome/surface.scss), in window coordinates.
		return {
			backgroundColor: base,
			backgroundImage: `${tint(barTint)}, linear-gradient(160deg, color-mix(in srgb, ${accent} 55%, ${base}) 0%, ${base} 75%)`,
			backgroundSize: "100% 100%, 100vw 100vh",
			backgroundRepeat: "no-repeat",
		};
	}
	if (mode === "plain" || !blurred) {
		return { backgroundColor: base, backgroundImage: tint(barTint) };
	}
	return {
		backgroundColor: base,
		backgroundImage: `${tint(barTint)}, ${tint(veil)}, url("${blurred}")`,
		backgroundSize: "100% 100%, 100% 100%, 100vw 100vw",
		backgroundPosition: "0 0, 0 0, 0 -25vw",
		backgroundRepeat: "no-repeat",
	};
}
