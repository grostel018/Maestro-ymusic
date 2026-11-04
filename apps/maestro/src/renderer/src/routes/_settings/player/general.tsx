import { createFileRoute } from "@tanstack/react-router";
import { ResetDefaults } from "@/components/reset-defaults";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsSelect } from "@/components/settings-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/player/general")({
	component: PlayerGeneralSettingsPage,
});

function PlayerGeneralSettingsPage() {
	const [resEnabled, , { isPending: resPending }] = useSettingsState("player.res.enabled", false);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Player</CardTitle>
					<CardDescription>Playback behavior and video preferences.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="player.skipDisliked"
							description={
								<span className="inline-flex items-center gap-2">
									Automatically skip tracks you disliked.
									<Badge variant="outline">Experimental</Badge>
								</span>
							}
						>
							Skip disliked songs
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="player.queueContinue"
							defaultValue={true}
							description="Load the next batch of a long playlist or Liked Songs before Up Next runs out."
						>
							Continue long queues
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="volumeRatio.enabled"
							description="Use an exponential volume curve for finer control than the default linear slider."
						>
							Exponential volume ratio
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="player.sponsorBlock"
							defaultValue={true}
							description="In music videos, skip the non-music parts (intros, skits, outros) that SponsorBlock users marked. Each skip shows Undo and Turn off. Only a short hash of the video id is sent."
						>
							Skip non-music parts
						</SettingsCheckbox>
						<SettingsCheckbox configKey="app.enableTaskbarProgress" description="Show playback progress on the taskbar.">
							Enable Taskbar Progress
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="player.chromecastEnabled"
							description={
								<span className="inline-flex items-center gap-2">
									Show YouTube Music Cast and talk to devices on this LAN. Restart required. Firewall must allow mDNS.
									<Badge variant="outline">Experimental</Badge>
								</span>
							}
						>
							Enable Chromecast
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Shared links</CardTitle>
					<CardDescription>How maestro:// links open, and whether copied links use them.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsSelect
							configKey="player.deepLinkOpen"
							defaultValue="ask"
							label="When opening a shared link"
							description="What happens when a maestro:// link opens this app."
							options={[
								{
									value: "ask",
									label: "Ask first",
									description: "Choose play now, add to queue, or cancel",
								},
								{
									value: "play",
									label: "Play immediately",
									description: "Start the track without a confirmation dialog",
								},
							]}
						/>
						<SettingsCheckbox
							configKey="player.replaceShareLinks"
							defaultValue={false}
							description="Copied links open in Maestro, but only for people who have it. Leave this off to share normal YouTube Music links."
						>
							Copy maestro:// links
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Video</CardTitle>
					<CardDescription>Preferred resolution when available.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="player.videoControls"
							defaultValue={true}
							description="A YouTube-style bar over the video: speed, subtitles, quality, loop, picture-in-picture, theater and full screen. YouTube's keys (k, j, l, f, c, i, t…) work after you click the video."
						>
							Video controls
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="player.keepPitch"
							defaultValue={true}
							description="Faster or slower playback keeps the original pitch."
						>
							Keep pitch when changing speed
						</SettingsCheckbox>
						<SettingsCheckbox configKey="player.res.enabled">Customize player video settings</SettingsCheckbox>
						{resEnabled && !resPending && (
							<SettingsSelect
								configKey="player.res.prefer"
								label="Preferred Video Resolution"
								options={[
									{ value: "hd2160", label: "2160P UHD / 4K" },
									{ value: "hd1440", label: "1440P QHD" },
									{ value: "hd1080", label: "1080P FHD" },
									{ value: "hd720", label: "720P HD" },
									{ value: "auto", label: "Default" },
								]}
							/>
						)}
					</FieldGroup>
				</CardContent>
			</Card>
			<ResetDefaults keys={["player", "volumeRatio"]} />
		</>
	);
}
