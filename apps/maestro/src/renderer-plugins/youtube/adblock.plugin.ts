import definePlugin from "@plugins/utils";
import adblockRenderer from "./adblock.renderer";

/** Fallback ad skipper and premium upsell hiding; runs in the page world (world-0 host). */
export default definePlugin(
	"adblock",
	{
		enabled: true,
		displayName: "Ad block fallback",
	},
	{
		renderer: adblockRenderer,
	},
);
