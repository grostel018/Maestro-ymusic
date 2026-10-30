import { curveFrequencies, EQ_PRESETS, eqCurve, eqFilters, totalPreamp } from "@shared/audio/eq";
import {
	type AudioSettings,
	CROSSFADE_MAX,
	DEFAULT_AUDIO,
	EQ_GAIN_LIMIT,
	type EqFilter,
	GRAPHIC_BANDS,
	MAX_FILTERS,
	normalizeAudio,
	PITCH_LIMIT,
} from "@shared/audio/settings";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ResetDefaults } from "@/components/reset-defaults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSettingsState } from "@/hooks/use-settings";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/player/audio")({
	component: AudioSettingsPage,
});

// The whole `audio` section is read and written as one object (normalizeAudio keeps it valid), so every control
// on this page shares one debounced write.

type Patch = (a: AudioSettings) => void;

function useAudio(): [AudioSettings, (patch: Patch) => void] {
	const [value, setValue] = useSettingsState<AudioSettings>("audio", DEFAULT_AUDIO, { debounce: 150, map: normalizeAudio });
	const update = (patch: Patch) =>
		setValue((prev) => {
			const next = structuredClone(normalizeAudio(prev));
			patch(next);
			return next;
		});
	return [value, update];
}

function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-sm font-medium">{label}</span>
				{description ? <span className="text-muted-foreground text-xs">{description}</span> : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">{children}</div>
		</div>
	);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	return <Switch checked={checked} onCheckedChange={(v) => onChange(!!v)} aria-label={label} />;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
	return (
		<div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
			{options.map((o) => (
				<Button
					key={o.value}
					size="xs"
					variant={o.value === value ? "default" : "outline"}
					role="radio"
					aria-checked={o.value === value}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</Button>
			))}
		</div>
	);
}

function Range({
	value,
	min,
	max,
	step = 1,
	onChange,
	label,
	format = (v: number) => String(v),
	className = "w-48",
}: {
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (v: number) => void;
	label: string;
	format?: (v: number) => string;
	className?: string;
}) {
	return (
		<div className="flex items-center gap-3">
			{/* A fixed-width box: the slider's own w-full (data-horizontal) would otherwise take 100 % of nothing. */}
			<div className={className}>
				<Slider
					className="w-full"
					value={[value]}
					min={min}
					max={max}
					step={step}
					aria-label={label}
					onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] as number) : (v as number))}
				/>
			</div>
			<span className="text-muted-foreground w-14 text-right text-xs tabular-nums">{format(value)}</span>
		</div>
	);
}

const db = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10} dB`;
const hz = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

/** The equalizer's response, drawn only while this page is open. */
function EqCurve({ filters, preamp }: { filters: EqFilter[]; preamp: number }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const c = ref.current;
		const g = c?.getContext("2d");
		if (!c || !g) return;
		const w = (c.width = c.clientWidth * devicePixelRatio);
		const h = (c.height = c.clientHeight * devicePixelRatio);
		const freqs = curveFrequencies(160);
		const curve = eqCurve(filters, preamp, freqs);
		const range = 18;
		const y = (v: number) => h / 2 - (Math.max(-range, Math.min(range, v)) / range) * (h / 2 - 4);
		g.clearRect(0, 0, w, h);
		g.strokeStyle = "rgba(128,128,128,0.35)";
		g.lineWidth = 1;
		g.beginPath();
		g.moveTo(0, y(0));
		g.lineTo(w, y(0));
		g.stroke();
		g.strokeStyle = getComputedStyle(c).color;
		g.lineWidth = 2 * devicePixelRatio;
		g.beginPath();
		curve.forEach((v, i) => {
			const x = (i / (curve.length - 1)) * w;
			if (i === 0) g.moveTo(x, y(v));
			else g.lineTo(x, y(v));
		});
		g.stroke();
	}, [filters, preamp]);
	return <canvas ref={ref} className="text-primary h-28 w-full rounded-md border" aria-label="Equalizer curve" data-testid="eq-curve" />;
}

function AutoEqSearch({ onPick }: { onPick: (profile: NonNullable<AudioSettings["eq"]["autoeq"]>) => void }) {
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(query.trim()), 300);
		return () => clearTimeout(t);
	}, [query]);
	const results = trpc.audio.autoeqSearch.useQuery(debounced, { enabled: debounced.length >= 2, staleTime: 60_000 });
	const load = trpc.audio.autoeqLoad.useMutation({ onSuccess: onPick });
	return (
		<div className="flex flex-col gap-2">
			<Input placeholder="Search your headphones, e.g. HD 600" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search AutoEq" />
			{results.isFetching ? <span className="text-muted-foreground text-xs">Searching…</span> : null}
			{results.error ? <span className="text-destructive text-xs">AutoEq is unreachable: {results.error.message}</span> : null}
			{load.error ? <span className="text-destructive text-xs">{load.error.message}</span> : null}
			<div className="flex max-h-48 flex-col gap-1 overflow-auto">
				{(results.data ?? []).map((e) => (
					<Button key={`${e.source}/${e.path}`} variant="ghost" size="sm" className="justify-between" disabled={load.isLoading} onClick={() => load.mutate(e)}>
						<span className="truncate">{e.name}</span>
						<span className="text-muted-foreground text-xs">{e.source}</span>
					</Button>
				))}
				{debounced.length >= 2 && results.data?.length === 0 ? <span className="text-muted-foreground text-xs">No match.</span> : null}
			</div>
		</div>
	);
}

function FilterRow({ f, onChange, onRemove }: { f: EqFilter; onChange: (f: EqFilter) => void; onRemove: () => void }) {
	const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : fallback);
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Segmented
				label="Filter type"
				value={f.type}
				options={[
					{ value: "lowshelf", label: "Low shelf" },
					{ value: "peaking", label: "Peak" },
					{ value: "highshelf", label: "High shelf" },
				]}
				onChange={(type) => onChange({ ...f, type })}
			/>
			<Input className="w-24" type="number" min={20} max={20000} value={f.frequency} aria-label="Frequency (Hz)" onChange={(e) => onChange({ ...f, frequency: num(e.target.value, f.frequency) })} />
			<span className="text-muted-foreground text-xs">Hz</span>
			<Input className="w-20" type="number" min={-12} max={12} step={0.1} value={f.gain} aria-label="Gain (dB)" onChange={(e) => onChange({ ...f, gain: num(e.target.value, f.gain) })} />
			<span className="text-muted-foreground text-xs">dB</span>
			<Input className="w-20" type="number" min={0.1} max={10} step={0.01} value={f.q} aria-label="Q" disabled={f.type !== "peaking"} onChange={(e) => onChange({ ...f, q: num(e.target.value, f.q) })} />
			<span className="text-muted-foreground text-xs">Q</span>
			<Button size="xs" variant="ghost" onClick={onRemove}>
				Remove
			</Button>
		</div>
	);
}

function EqualizerCard({ audio, update }: { audio: AudioSettings; update: (p: Patch) => void }) {
	const eq = audio.eq;
	const [presetName, setPresetName] = useState("");
	const [importText, setImportText] = useState("");
	const [note, setNote] = useState("");
	const { filters } = eqFilters(eq);
	const preamp = totalPreamp(eq);

	const exportEq = async () => {
		const data = JSON.stringify({ mode: eq.mode, bands: eq.bands, filters: eq.filters, preamp: eq.preamp, autoeq: eq.autoeq }, null, 2);
		await navigator.clipboard.writeText(data).catch(() => undefined);
		setNote("Equalizer copied to the clipboard.");
	};
	const importEq = () => {
		try {
			const raw = JSON.parse(importText);
			const next = normalizeAudio({ eq: { ...raw, enabled: true } }).eq;
			update((a) => (a.eq = { ...next, userPresets: a.eq.userPresets, preset: "custom" }));
			setImportText("");
			setNote("Equalizer imported.");
		} catch {
			setNote("That is not an exported equalizer.");
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Equalizer</CardTitle>
				<CardDescription>Shape the sound with a 10-band or parametric equalizer, or correct your headphones with AutoEq.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<Row label="Equalizer" description="A gain guard lowers the level so boosts never clip.">
						<Button
							size="xs"
							variant="outline"
							onClick={() => update((a) => (a.eq.enabled = !a.eq.enabled))}
							title="Compare with and without the equalizer"
							data-testid="eq-ab"
						>
							{eq.enabled ? "A/B: on" : "A/B: off"}
						</Button>
						<Toggle label="Equalizer" checked={eq.enabled} onChange={(v) => update((a) => (a.eq.enabled = v))} />
					</Row>
					<Segmented
						label="Equalizer mode"
						value={eq.mode}
						options={[
							{ value: "graphic", label: "10-band" },
							{ value: "parametric", label: "Parametric" },
							{ value: "autoeq", label: "Headphones (AutoEq)" },
						]}
						onChange={(mode) => update((a) => (a.eq.mode = mode))}
					/>
					<EqCurve filters={filters} preamp={preamp} />

					{eq.mode === "graphic" ? (
						<>
							<div className="flex flex-wrap gap-1">
								{EQ_PRESETS.map((p) => (
									<Button
										key={p.id}
										size="xs"
										variant={eq.preset === p.id ? "default" : "outline"}
										onClick={() => update((a) => ((a.eq.bands = [...p.bands]), (a.eq.preset = p.id)))}
									>
										{p.label}
									</Button>
								))}
								{eq.userPresets.map((p) => (
									<span key={p.name} className="inline-flex items-center">
										<Button size="xs" variant={eq.preset === `user:${p.name}` ? "default" : "secondary"} onClick={() => update((a) => ((a.eq.bands = [...p.bands]), (a.eq.preset = `user:${p.name}`)))}>
											{p.name}
										</Button>
										<Button size="xs" variant="ghost" aria-label={`Delete preset ${p.name}`} onClick={() => update((a) => (a.eq.userPresets = a.eq.userPresets.filter((u) => u.name !== p.name)))}>
											×
										</Button>
									</span>
								))}
							</div>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{GRAPHIC_BANDS.map((f, i) => (
									<div key={f} className="flex items-center gap-2">
										<span className="text-muted-foreground w-10 text-xs tabular-nums">{hz(f)}</span>
										<Range
											label={`${hz(f)} Hz`}
											value={eq.bands[i]}
											min={-EQ_GAIN_LIMIT}
											max={EQ_GAIN_LIMIT}
											step={0.5}
											format={db}
											className="w-40"
											onChange={(v) => update((a) => ((a.eq.bands[i] = v), (a.eq.preset = "custom")))}
										/>
									</div>
								))}
							</div>
							<div className="flex items-center gap-2">
								<Input className="w-48" placeholder="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" />
								<Button
									size="sm"
									variant="outline"
									disabled={!presetName.trim()}
									onClick={() => {
										const name = presetName.trim();
										update((a) => {
											a.eq.userPresets = [...a.eq.userPresets.filter((p) => p.name !== name), { name, bands: [...a.eq.bands] }];
											a.eq.preset = `user:${name}`;
										});
										setPresetName("");
									}}
								>
									Save preset
								</Button>
							</div>
						</>
					) : null}

					{eq.mode === "parametric" ? (
						<div className="flex flex-col gap-2">
							{eq.filters.map((f, i) => (
								<FilterRow
									key={i}
									f={f}
									onChange={(next) => update((a) => (a.eq.filters[i] = next))}
									onRemove={() => update((a) => a.eq.filters.splice(i, 1))}
								/>
							))}
							<div>
								<Button
									size="sm"
									variant="outline"
									disabled={eq.filters.length >= MAX_FILTERS}
									onClick={() => update((a) => a.eq.filters.push({ type: "peaking", frequency: 1000, q: 1, gain: 0 }))}
								>
									Add filter
								</Button>
							</div>
						</div>
					) : null}

					{eq.mode === "autoeq" ? (
						<div className="flex flex-col gap-2">
							{eq.autoeq ? (
								<span className="text-sm" data-testid="autoeq-loaded">
									{eq.autoeq.name}: {eq.autoeq.filters.length} filters, preamp {db(eq.autoeq.preamp)}
								</span>
							) : (
								<span className="text-muted-foreground text-sm">No headphone profile yet.</span>
							)}
							<AutoEqSearch onPick={(profile) => update((a) => ((a.eq.autoeq = profile), (a.eq.mode = "autoeq"), (a.eq.enabled = true)))} />
							<span className="text-muted-foreground text-xs">Profiles come from the AutoEq project and are kept offline once loaded.</span>
						</div>
					) : null}

					<Row label="Preamp" description={`Total level change, including the clipping guard: ${db(preamp)}`}>
						<Range label="Preamp" value={eq.preamp} min={-12} max={6} step={0.5} format={db} onChange={(v) => update((a) => (a.eq.preamp = v))} />
					</Row>
					<div className="flex flex-wrap items-center gap-2">
						<Button size="sm" variant="outline" onClick={() => void exportEq()}>
							Export
						</Button>
						<Input className="w-64" placeholder="Paste an exported equalizer" value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Import equalizer" />
						<Button size="sm" variant="outline" disabled={!importText.trim()} onClick={importEq}>
							Import
						</Button>
						{note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
					</div>
				</FieldGroup>
			</CardContent>
		</Card>
	);
}

function ChainView() {
	const graph = trpc.audio.graph.useQuery(undefined, { refetchInterval: 1000 });
	const g = graph.data;
	const names: Record<string, string> = {
		input: "Loudness",
		eq: "Equalizer",
		spatial: "Spatial",
		karaoke: "Vocal reduction",
		pitch: "Pitch",
		dynamics: "Compressor",
		fade: "Transitions",
		analyser: "Analyser",
	};
	return (
		<div className="flex flex-wrap items-center gap-1" data-testid="audio-chain">
			{!g?.attached ? <Badge variant="outline">Plays natively (no stage on)</Badge> : null}
			{g?.attached && !g.chain.length ? <Badge variant="outline">Direct</Badge> : null}
			{g?.chain.map((id) => (
				<Badge key={id}>{names[id] ?? id}</Badge>
			))}
			{g?.failed.map((id) => (
				<Badge key={id} variant="destructive">
					{names[id] ?? id} failed
				</Badge>
			))}
		</div>
	);
}

/** The effects that change the sound with these settings, in plain words (empty: the sound is untouched). */
function activeEffects(a: AudioSettings): string[] {
	const out: string[] = [];
	if (a.eq.enabled) out.push("Equalizer");
	if (a.spatial.crossfeed !== "off") out.push(`Crossfeed (${a.spatial.crossfeed})`);
	if (a.spatial.width !== 100) out.push(`Stereo width ${a.spatial.width}%`);
	if (a.spatial.surround) out.push("Virtual surround");
	if (a.spatial.rotate) out.push("8D rotation");
	if (a.dynamics.normalize) out.push("Loudness normalization");
	if (a.dynamics.compressor !== "off") out.push(`Compressor (${a.dynamics.compressor})`);
	if (a.karaoke.enabled && a.karaoke.amount > 0) out.push("Vocal reduction");
	if (a.pitch.semitones !== 0) out.push(`Pitch ${a.pitch.semitones > 0 ? "+" : ""}${a.pitch.semitones} semitones`);
	if (a.transitions.crossfade > 0) out.push(`Crossfade ${a.transitions.crossfade} s`);
	return out;
}

/** Every sound effect off; keeps the equalizer's curve and presets, the visualizer and wheel volume. */
function allOff(a: AudioSettings): AudioSettings {
	const d = normalizeAudio(undefined);
	return { ...d, eq: { ...a.eq, enabled: false }, visualizer: a.visualizer, volumeWheel: a.volumeWheel };
}

function AudioSettingsPage() {
	const [audio, update] = useAudio();
	const sp = audio.spatial;
	const active = activeEffects(audio);
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Audio</CardTitle>
					<CardDescription>
						Every effect is optional; with all of them off, YouTube Music plays its sound untouched. Pick the output device from the speaker
						button in the player bar, and the sleep timer from the moon button.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row
							label={active.length ? "Changing the sound now" : "The sound is untouched"}
							description={active.length ? active.join(" · ") : "No effect is on: YouTube Music plays its sound as it is."}
						>
							{active.length ? (
								<Button size="sm" variant="outline" onClick={() => update((a) => Object.assign(a, allOff(a)))}>
									Turn all off
								</Button>
							) : null}
						</Row>
						<Row label="Signal chain" description="Stages running now, in order.">
							<ChainView />
						</Row>
					</FieldGroup>
				</CardContent>
			</Card>

			<EqualizerCard audio={audio} update={update} />

			<Card>
				<CardHeader>
					<CardTitle>Spatial</CardTitle>
					<CardDescription>Headphone crossfeed, stereo width, virtual surround and 8D rotation.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row label="Crossfeed" description="Blends a little of each side into the other ear, like speakers. For headphones.">
							<Segmented
								label="Crossfeed"
								value={sp.crossfeed}
								options={[
									{ value: "off", label: "Off" },
									{ value: "light", label: "Light" },
									{ value: "medium", label: "Medium" },
									{ value: "strong", label: "Strong" },
								]}
								onChange={(v) => update((a) => (a.spatial.crossfeed = v))}
							/>
						</Row>
						<Row label="Stereo width" description="0 % is mono, 100 % unchanged, 200 % extra wide.">
							<Range label="Stereo width" value={sp.width} min={0} max={200} step={5} format={(v) => `${v}%`} onChange={(v) => update((a) => (a.spatial.width = v))} />
						</Row>
						<Row label="Virtual surround" description="Places the two channels around you (best on headphones).">
							<Toggle label="Virtual surround" checked={sp.surround} onChange={(v) => update((a) => (a.spatial.surround = v))} />
						</Row>
						<Row label="8D rotation" description="Moves the sound slowly around your head.">
							<Toggle label="8D rotation" checked={sp.rotate} onChange={(v) => update((a) => (a.spatial.rotate = v))} />
						</Row>
						{sp.rotate ? (
							<Row label="Rotation speed">
								<Range
									label="Rotation speed"
									value={sp.rotateSpeed}
									min={0.02}
									max={1}
									step={0.02}
									format={(v) => `${Math.round(60 * v)} rpm`}
									onChange={(v) => update((a) => (a.spatial.rotateSpeed = v))}
								/>
							</Row>
						) : null}
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Loudness and dynamics</CardTitle>
					<CardDescription>Even out levels between tracks and within a track.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row label="Normalize loudness" description="Raises quiet tracks using YouTube's loudness data (loud ones are already turned down).">
							<Toggle label="Normalize loudness" checked={audio.dynamics.normalize} onChange={(v) => update((a) => (a.dynamics.normalize = v))} />
						</Row>
						<Row label="Compressor" description="Gentle evens out peaks; Night keeps quiet and loud parts close together.">
							<Segmented
								label="Compressor"
								value={audio.dynamics.compressor}
								options={[
									{ value: "off", label: "Off" },
									{ value: "gentle", label: "Gentle" },
									{ value: "night", label: "Night" },
								]}
								onChange={(v) => update((a) => (a.dynamics.compressor = v))}
							/>
						</Row>
						<Row label="Mouse wheel volume" description="Scroll over the player bar to change the volume in 1 % steps.">
							<Toggle label="Mouse wheel volume" checked={audio.volumeWheel} onChange={(v) => update((a) => (a.volumeWheel = v))} />
						</Row>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Transitions</CardTitle>
					<CardDescription>Fade between tracks and skip silent parts.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row label="Crossfade" description="Fades a track out before it ends and the next one in. 0 is off.">
							<Range
								label="Crossfade"
								value={audio.transitions.crossfade}
								min={0}
								max={CROSSFADE_MAX}
								step={1}
								format={(v) => (v ? `${v} s` : "Off")}
								onChange={(v) => update((a) => (a.transitions.crossfade = v))}
							/>
						</Row>
						<Row label="Skip silence" description="Jumps over silence longer than 1.5 s; at a track's end, goes to the next track.">
							<Toggle label="Skip silence" checked={audio.transitions.skipSilence} onChange={(v) => update((a) => (a.transitions.skipSilence = v))} />
						</Row>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Karaoke and pitch</CardTitle>
					<CardDescription>Turn the vocals down, or move the key without changing the speed.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row label="Vocal reduction" description="Lowers the centre of the mix, where the lead voice usually is.">
							<Toggle label="Vocal reduction" checked={audio.karaoke.enabled} onChange={(v) => update((a) => (a.karaoke.enabled = v))} />
						</Row>
						{audio.karaoke.enabled ? (
							<Row label="Amount">
								<Range
									label="Vocal reduction amount"
									value={audio.karaoke.amount}
									min={0}
									max={1}
									step={0.05}
									format={(v) => `${Math.round(v * 100)}%`}
									onChange={(v) => update((a) => (a.karaoke.amount = v))}
								/>
							</Row>
						) : null}
						<Row label="Pitch" description="Semitones up or down. It colours the sound and adds a short delay, so keep it Off unless you need it.">
							{audio.pitch.semitones !== 0 ? (
								<Button size="xs" variant="outline" onClick={() => update((a) => (a.pitch.semitones = 0))}>
									Off
								</Button>
							) : null}
							<Range
								label="Pitch"
								value={audio.pitch.semitones}
								min={-PITCH_LIMIT}
								max={PITCH_LIMIT}
								step={1}
								format={(v) => (v ? `${v > 0 ? "+" : ""}${v} st` : "Off")}
								onChange={(v) => update((a) => (a.pitch.semitones = v))}
							/>
						</Row>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Visualizer</CardTitle>
					<CardDescription>Bars or a wave over the bottom of the player, drawn only while the player is open.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Row label="Visualizer">
							<Toggle label="Visualizer" checked={audio.visualizer.enabled} onChange={(v) => update((a) => (a.visualizer.enabled = v))} />
						</Row>
						<Row label="Style">
							<Segmented
								label="Visualizer style"
								value={audio.visualizer.style}
								options={[
									{ value: "bars", label: "Bars" },
									{ value: "wave", label: "Wave" },
								]}
								onChange={(v) => update((a) => (a.visualizer.style = v))}
							/>
						</Row>
					</FieldGroup>
				</CardContent>
			</Card>
			<ResetDefaults keys={["audio"]} label="Turn every audio effect off (defaults)" />
		</>
	);
}
