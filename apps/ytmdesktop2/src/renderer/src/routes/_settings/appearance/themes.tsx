import { DEFAULT_LOOK, exportLook, type Look, lookTokens, normalizeLook, PALETTES, readTokens } from "@shared/theme/look";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsInput } from "@/components/settings-input";
import { SettingsSelect } from "@/components/settings-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSettingsState } from "@/hooks/use-settings";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/appearance/themes")({
	component: ThemesSettingsPage,
});

function Swatch({ color }: { color: string }) {
	return <span className="inline-block size-3 rounded-full border border-white/20" style={{ backgroundColor: color }} />;
}

function LookCard() {
	const [look, setLook] = useSettingsState<Look>("themes.look", DEFAULT_LOOK, { debounce: 150, map: normalizeLook });
	const [importText, setImportText] = useState("");
	const [note, setNote] = useState("");
	const update = (patch: Partial<Look>) => setLook((prev) => ({ ...normalizeLook(prev), ...patch }));
	const tokens = lookTokens(look);
	const custom = look.accent !== "palette" && look.accent !== "song";
	const choices = [...PALETTES, ...(look.imported ? [{ id: "imported", name: look.imported.name, tokens: look.imported }] : [])];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Colors</CardTitle>
				<CardDescription>A palette for YouTube Music's colors, an accent for sliders, switches and buttons, and the corner shape of covers.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Palette">
						{choices.map((p) => (
							<Button
								key={p.id}
								variant={look.palette === p.id ? "default" : "outline"}
								size="sm"
								role="radio"
								aria-checked={look.palette === p.id}
								className="justify-start gap-2"
								onClick={() => update({ palette: p.id })}
							>
								<span className="flex gap-0.5">
									<Swatch color={p.tokens.base} />
									<Swatch color={p.tokens.surface} />
									<Swatch color={p.tokens.accent} />
								</span>
								<span className="truncate">{p.name}</span>
							</Button>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-medium">Accent</span>
						{(["palette", "song"] as const).map((a) => (
							<Button key={a} size="xs" variant={look.accent === a ? "default" : "outline"} onClick={() => update({ accent: a })}>
								{a === "palette" ? "Palette" : "Song color"}
							</Button>
						))}
						<label className="inline-flex items-center gap-1 text-xs">
							<input
								type="color"
								aria-label="Custom accent color"
								value={custom ? look.accent : tokens.accent}
								onChange={(e) => update({ accent: e.target.value })}
								className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
							/>
							Custom
						</label>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-medium">Corners</span>
						{(["square", "soft", "round"] as const).map((r) => (
							<Button key={r} size="xs" variant={look.radius === r ? "default" : "outline"} onClick={() => update({ radius: r })}>
								{r === "square" ? "Square" : r === "soft" ? "Soft" : "Round"}
							</Button>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								void navigator.clipboard.writeText(exportLook(look)).catch(() => undefined);
								setNote("Theme copied to the clipboard (.ytmdtheme.json).");
							}}
						>
							Export
						</Button>
						<Input className="w-64" placeholder="Paste a .ytmdtheme.json" value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Import theme" />
						<Button
							size="sm"
							variant="outline"
							disabled={!importText.trim()}
							onClick={() => {
								try {
									const raw = JSON.parse(importText) as Record<string, unknown>;
									const tokens = readTokens(raw);
									if (!tokens) throw new Error("bad");
									const radius = raw.radius === "square" || raw.radius === "round" || raw.radius === "soft" ? raw.radius : look.radius;
									update({ palette: "imported", imported: tokens, accent: "palette", radius });
									setImportText("");
									setNote(`Imported "${tokens.name}".`);
								} catch {
									setNote("That is not a theme: it needs base, surface, text, subtext and accent as #rrggbb colors.");
								}
							}}
						>
							Import
						</Button>
						{note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
					</div>
				</FieldGroup>
			</CardContent>
		</Card>
	);
}

function ThemesSettingsPage() {
	const [enabled, , { isPending: enabledPending }] = useSettingsState("themes.enabled", false);
	const [selected, , { isPending: selectedPending }] = useSettingsState("themes.selected", "default");
	const [customFile, , { isPending: pathPending }] = useSettingsState("themes.customFile", "");
	const { data: themes } = trpc.themes.list.useQuery();
	const { mutateAsync: reload } = trpc.themes.reload.useMutation();
	const { mutateAsync: openFile } = trpc.app.openFile.useMutation();

	const isCustom = selected === "custom";
	const themeOptions =
		themes?.map((t) => ({ value: t.id, label: t.name })) ??
		[
			{ value: "default", label: "Default" },
			{ value: "custom", label: "Custom" },
		];

	return (
		<>
		<LookCard />
		<Card>
			<CardHeader>
				<CardTitle>Themes</CardTitle>
				<CardDescription>How the window looks. The background covers everything: title bar, side panel, page and player bar.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<SettingsSelect
						configKey="themes.background"
						label="Background"
						defaultValue="artwork"
						options={[
							{ value: "artwork", label: "Song artwork", description: "A soft blur of the playing song's cover, changing with each song." },
							{ value: "plain", label: "Plain", description: "The palette's base color everywhere." },
							{ value: "video", label: "Video ambient", description: "The playing video, softly blurred behind everything (the artwork in Song mode)." },
							{ value: "color", label: "Song color", description: "A gradient from the playing song's main color." },
						]}
					/>
					<SettingsCheckbox
						configKey="themes.enabled"
						description="Rounded covers, a cleaner player bar and queue. Off shows YouTube Music's own layout. The background above applies either way."
					>
						Theme styling
					</SettingsCheckbox>
					{enabled && !enabledPending && (
						<>
							<SettingsSelect configKey="themes.selected" label="Theme" defaultValue="default" options={themeOptions} />
							{isCustom && !selectedPending && (
								<>
									<SettingsCheckbox configKey="themes.watching" description="Recompile and inject when the file changes on disk.">
										Update on Changes
									</SettingsCheckbox>
									<SettingsInput
										configKey="themes.customFile"
										type="file"
										accept=".scss,.sass,.css"
										label="Custom Theme File"
										hint={
											<div className="mt-2 flex justify-end gap-2">
												<Button type="button" size="sm" variant="outline" disabled={pathPending} onClick={() => void reload()}>
													Reload
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={pathPending || !customFile}
													onClick={() => {
														if (customFile) void openFile(customFile);
													}}
												>
													Open File
												</Button>
											</div>
										}
									/>
								</>
							)}
							{!isCustom && (
								<div className="flex justify-end">
									<Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
										Reload
									</Button>
								</div>
							)}
						</>
					)}
				</FieldGroup>
			</CardContent>
		</Card>
		</>
	);
}
