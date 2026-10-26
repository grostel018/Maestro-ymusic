import { makeBlurredArtwork, SURFACE_BAR_TINT, SURFACE_BASE, SURFACE_VEIL } from "@shared/artwork/blur";
import { resolveArtworkUrl } from "@shared/track/thumbnail";
import { type CSSProperties, useEffect, useState } from "react";
import { useSettingsState } from "@/hooks/use-settings";
import { useTrack } from "@/hooks/use-track";

const tint = (color: string) => `linear-gradient(${color}, ${color})`;

/**
 * Background for the app's title bar that continues the YouTube page's surface (chrome/surface.scss): the same
 * pre-blurred artwork in the same window-coordinate geometry (100vw square, shifted up 25vw), the same veil,
 * and the bar tint the page's top bar uses. The title bar sits at the window's top, so its coordinates are
 * window coordinates and the two meet without a seam.
 */
export function useSurfaceBackground(): CSSProperties {
	const [mode] = useSettingsState<"artwork" | "plain">("themes.background", "artwork");
	const track = useTrack();
	const artworkUrl = mode === "plain" ? null : resolveArtworkUrl(track);
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

	if (mode === "plain" || !blurred) {
		return { backgroundColor: SURFACE_BASE, backgroundImage: tint(SURFACE_BAR_TINT) };
	}
	return {
		backgroundColor: SURFACE_BASE,
		backgroundImage: `${tint(SURFACE_BAR_TINT)}, ${tint(SURFACE_VEIL)}, url("${blurred}")`,
		backgroundSize: "100% 100%, 100% 100%, 100vw 100vw",
		backgroundPosition: "0 0, 0 0, 0 -25vw",
		backgroundRepeat: "no-repeat",
	};
}
