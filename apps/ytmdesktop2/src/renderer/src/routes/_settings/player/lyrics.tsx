import { createFileRoute } from "@tanstack/react-router";
import { LyricsProvidersOrder } from "@/components/lyrics-providers-order";
import { ResetDefaults } from "@/components/reset-defaults";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsInput } from "@/components/settings-input";
import { SettingsSelect, type SettingsSelectOption } from "@/components/settings-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/player/lyrics")({
	component: LyricsSettingsPage,
});

const LINE_STYLE_OPTIONS: SettingsSelectOption[] = [
	{
		value: "highlight",
		label: "Highlight only",
		description: "The current line is large and bright; no fill.",
	},
	{
		value: "fill",
		label: "Text fill",
		description: "The current line fills as it's sung: word by word with word timing, across the line with line timing.",
	},
];

const GLOW_OPTIONS: SettingsSelectOption[] = [
	{ value: "off", label: "Off", description: "No light on the current line." },
	{ value: "song", label: "Song color", description: "Light in the artwork's main color flows through the current line." },
	{ value: "accent", label: "Theme accent", description: "Uses the accent color of the active theme." },
	{ value: "custom", label: "Custom color", description: "Pick the color below." },
];

/** Text size and glow; the size also changes with the A− / A+ buttons in the Lyrics tab. */
function LyricsLook({ disabled }: { disabled: boolean }) {
	const [scale, setScale] = useSettingsState<number>("lyrics.fontScale", 1, { debounce: 150 });
	const [glow] = useSettingsState<string>("lyrics.glow", "song");
	const [color, setColor] = useSettingsState<string>("lyrics.glowColor", "#ffffff", { debounce: 150 });
	const value = typeof scale === "number" ? scale : 1;
	return (
		<FieldGroup>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">Text size</span>
					<span className="text-muted-foreground text-xs tabular-nums">{Math.round(value * 100)}%</span>
				</div>
				<Slider
					value={[value]}
					min={0.7}
					max={2}
					step={0.05}
					disabled={disabled}
					aria-label="Lyrics text size"
					onValueChange={(v) => setScale(Array.isArray(v) ? (v[0] as number) : (v as number))}
				/>
				<p className="text-muted-foreground text-xs">Also in the Lyrics tab: the A− and A+ buttons.</p>
			</div>
			<SettingsSelect
				configKey="lyrics.glow"
				defaultValue="song"
				disabled={disabled}
				label="Glow on the current line"
				description="Streaks of light flow through the letters; the word being sung shines most."
				options={GLOW_OPTIONS}
			/>
			<SettingsCheckbox
				configKey="lyrics.glowBeat"
				defaultValue={true}
				disabled={disabled || glow === "off"}
				description="The light gets brighter on the bass. Uses the audio engine; the sound does not change."
			>
				Pulse with the beat
			</SettingsCheckbox>
			{glow === "custom" ? (
				<label className="flex items-center gap-3 text-sm">
					<input
						type="color"
						className="h-8 w-12 cursor-pointer rounded border"
						value={color || "#ffffff"}
						disabled={disabled}
						onChange={(e) => setColor(e.target.value)}
						aria-label="Glow color"
					/>
					Glow color
				</label>
			) : null}
		</FieldGroup>
	);
}

function LyricsSettingsPage() {
	const [lyricsEnabled] = useSettingsState<boolean>("lyrics.enabled", false);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Lyrics</CardTitle>
					<CardDescription>
						Replace the YouTube Music Lyrics tab with timed lyrics. Word or syllable highlighting uses whatever the
						winning provider returns.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="lyrics.enabled"
							description="When enabled, open the Lyrics tab in the player to see synced lines. Click a line or word to seek."
						>
							Enable lyrics
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.autoOpenTab"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Switch the player page to the Lyrics tab when lyrics for a new track are found. Once per track, so switching away by hand sticks."
						>
							Auto-open Lyrics tab
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.preferWordSync"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Keep trying later providers for word/syllable timing before settling for line-synced lyrics. A few extra requests on line-only songs."
						>
							Prefer word-synced sources
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.showEvenIfInexact"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="For LRCLib matches, show lyrics when title/artist are close but not exact."
						>
							Allow approximate matches
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.showTimeCodes"
							disabled={!lyricsEnabled}
							description="Prefix each line with its timestamp."
						>
							Show time codes
						</SettingsCheckbox>
						<SettingsSelect
							configKey="lyrics.lineStyle"
							defaultValue="fill"
							disabled={!lyricsEnabled}
							label="Highlight style"
							description="How the current line shows progress. Shift+K or the microphone button in the player bar opens full-screen karaoke."
							options={LINE_STYLE_OPTIONS}
						/>
					</FieldGroup>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Look</CardTitle>
					<CardDescription>Size of the lyrics and the light around the current line, in the Lyrics tab and in karaoke.</CardDescription>
				</CardHeader>
				<CardContent>
					<LyricsLook disabled={!lyricsEnabled} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Providers</CardTitle>
					<CardDescription>
						Tried in order until one returns lyrics (default: Better Lyrics → Unison → LRCLib → YouTube captions). Better Lyrics and Unison
						can return syllable sync; LRCLib is line/plain (word sync when the entry has it); YouTube captions is line-only and
						uses the current video's own caption track. Toggle sources on or off and drag to reorder.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<LyricsProvidersOrder disabled={!lyricsEnabled} />
						<SettingsInput
							configKey="lyrics.betterLyricsApiKey"
							type="password"
							autoComplete="off"
							spellCheck={false}
							disabled={!lyricsEnabled}
							placeholder="Optional"
							label="Better Lyrics API key"
							hint={
								<>
									Sent as <code>X-API-Key</code>. Cached songs never need a key; uncached songs do, and Better
									Lyrics is not issuing new keys right now. Without one, play a song once in the Better Lyrics
									browser extension to cache it.
								</>
							}
						/>
					</FieldGroup>
				</CardContent>
				<CardFooter>
					<p className="text-xs text-muted-foreground">Site links open each provider&apos;s homepage or docs.</p>
				</CardFooter>
			</Card>
			<ResetDefaults keys={["lyrics"]} />
		</>
	);
}
