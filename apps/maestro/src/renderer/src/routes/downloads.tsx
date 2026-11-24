import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	FolderOpenIcon,
	ListPlusIcon,
	ListStartIcon,
	MusicIcon,
	PauseIcon,
	PlayIcon,
	RefreshCwIcon,
	SearchIcon,
	ShuffleIcon,
	Trash2Icon,
	WifiOffIcon,
	XIcon,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OutputMenu } from "@/components/offline-player/output-menu";
import { PlayerBar } from "@/components/offline-player/player-bar";
import { QueuePanel } from "@/components/offline-player/queue-panel";
import { SleepMenu, useSleepTimer } from "@/components/offline-player/sleep-menu";
import { SpeedMenu, stepSpeed } from "@/components/offline-player/speed-menu";
import { useOfflinePlayer } from "@/components/offline-player/use-offline-player";
import { useShortcuts } from "@/components/offline-player/use-shortcuts";
import { Button } from "@/components/ui/button";
import { useSettingsState } from "@/hooks/use-settings";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/downloads")({
	component: DownloadsPage,
});

type Collection = { id: string; kind: "album" | "playlist"; title: string; artist?: string; artUrl?: string };
type Item = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
	trackNumber?: number;
	collection?: Collection;
	addedAt: number;
	url: string | null;
	artSrc: string | null;
	size: number;
};
/** An album or playlist on the Downloads page: from the page it was downloaded from, or songs sharing an album. */
type Group = { key: string; kind: "album" | "playlist"; title: string; artist: string; art: string | null; items: Item[] };
type View = { page: "library"; tab: "albums" | "playlists" | "songs" } | { page: "group"; key: string };

const fmtTime = (sec: number | undefined) => {
	if (!sec || !Number.isFinite(sec)) return "";
	const s = Math.floor(sec);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtLength = (sec: number) => {
	const min = Math.round(sec / 60);
	return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};
const fmtSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const songs = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;

function groupItems(items: Item[]): Group[] {
	const groups = new Map<string, Group>();
	for (const item of items) {
		const c = item.collection;
		const key = c ? c.id : item.album ? `album:${item.artist.toLowerCase()}:${item.album.toLowerCase()}` : null;
		if (!key) continue;
		let g = groups.get(key);
		if (!g) {
			g = { key, kind: c?.kind ?? "album", title: c?.title ?? item.album ?? "", artist: c?.artist ?? item.artist, art: item.artSrc, items: [] };
			groups.set(key, g);
		}
		g.art ??= item.artSrc;
		g.items.push(item);
	}
	for (const g of groups.values()) {
		g.items.sort((a, b) => (g.kind === "album" ? (a.trackNumber ?? 999) - (b.trackNumber ?? 999) || a.addedAt - b.addedAt : a.addedAt - b.addedAt));
	}
	return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function Cover({ src, className }: { src: string | null; className?: string }) {
	const [failed, setFailed] = useState(false);
	return src && !failed ? (
		<img src={src} alt="" className={cn("object-cover", className)} onError={() => setFailed(true)} draggable={false} />
	) : (
		<div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
			<MusicIcon className="size-1/3 max-h-10 max-w-10" />
		</div>
	);
}

function useOnline() {
	const [online, setOnline] = useState(navigator.onLine);
	useEffect(() => {
		const on = () => setOnline(true);
		const off = () => setOnline(false);
		window.addEventListener("online", on);
		window.addEventListener("offline", off);
		return () => {
			window.removeEventListener("online", on);
			window.removeEventListener("offline", off);
		};
	}, []);
	return online;
}

function DownloadsPage() {
	const utils = trpc.useUtils();
	const list = trpc.downloads.list.useQuery();
	const status = trpc.downloads.status.useQuery();
	const online = useOnline();
	const [view, setView] = useState<View>({ page: "library", tab: "albums" });
	const [query, setQuery] = useState("");
	const [confirming, setConfirming] = useState<string | null>(null);
	const refresh = useCallback(() => {
		void utils.downloads.list.invalidate();
		void utils.downloads.status.invalidate();
	}, [utils]);
	trpc.downloads.onChange.useSubscription(undefined, { onData: refresh });
	trpc.downloads.onStatus.useSubscription(undefined, { onData: () => void utils.downloads.status.invalidate() });

	const remove = trpc.downloads.remove.useMutation({ onSuccess: refresh });
	const cancel = trpc.downloads.cancel.useMutation({ onSuccess: refresh });
	const retry = trpc.downloads.retry.useMutation({ onSuccess: refresh });
	const dismiss = trpc.downloads.dismiss.useMutation({ onSuccess: refresh });
	const showInFolder = trpc.downloads.showInFolder.useMutation();
	const openFolder = trpc.downloads.openFolder.useMutation();
	const closePage = trpc.downloads.closePage.useMutation();
	const hidePage = trpc.downloads.hidePage.useMutation();
	/** Reload YouTube Music behind Downloads, so the offline song keeps playing; the "back online" bar follows. */
	const retryOnline = trpc.downloads.retryOnline.useMutation();
	const reportPlayer = trpc.downloads.reportPlayer.useMutation();
	const [backOnline, setBackOnline] = useState(false);
	trpc.downloads.onOnline.useSubscription(undefined, { onData: () => setBackOnline(true) });

	const items = (list.data ?? []) as Item[];
	const groups = useMemo(() => groupItems(items), [items]);
	const inProgress = (status.data ?? []).filter((s) => s.state !== "done" && s.state !== "error");
	const failed = (status.data ?? []).filter((s) => s.state === "error");
	const commonError = failed.length > 1 && failed.every((f) => f.error === failed[0].error) ? failed[0].error : null;
	const totalSize = items.reduce((sum, i) => sum + i.size, 0);

	const audioRef = useRef<HTMLAudioElement>(null);
	const sleep = useSleepTimer(audioRef);
	const [volumeRatio] = useSettingsState("volumeRatio.enabled", true);
	const volumeCurve = useCallback((v: number) => (volumeRatio ? v ** 3 : v), [volumeRatio]);
	const player = useOfflinePlayer(items, { audioRef, onBoundary: sleep.onBoundary, gain: sleep.gain, volumeCurve });
	const { current, playing } = player;
	// Speed is per player and not saved (spec); pitch follows the shared setting.
	const [rate, setRate] = useState(1);
	const [keepPitch] = useSettingsState("player.keepPitch", true);
	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;
		el.defaultPlaybackRate = rate;
		el.playbackRate = rate;
		el.preservesPitch = keepPitch;
	}, [rate, keepPitch, current?.videoId]);
	const changeVolume = (by: number) => {
		player.setMuted(false);
		player.setVolume((v) => Math.max(0, Math.min(1, Math.round((v + by) * 100) / 100)));
	};
	useShortcuts((a) => {
		const el = audioRef.current;
		if (a === "toggle") player.toggle();
		else if (a === "seek+5" && el) player.seek(el.currentTime + 5);
		else if (a === "seek-5" && el) player.seek(el.currentTime - 5);
		else if (a === "speed+") setRate((r) => stepSpeed(r, 1));
		else if (a === "speed-") setRate((r) => stepSpeed(r, -1));
		else if (a === "mute") player.setMuted((m) => !m);
	});
	const [queueOpen, setQueueOpen] = useState(false);
	const playList = (list: Item[], startAt = 0, shuffle = false) => player.play(list, shuffle ? undefined : list[startAt]?.videoId, shuffle);
	const back = () => {
		if (view.page === "group") setView({ page: "library", tab: groups.find((g) => g.key === view.key)?.kind === "playlist" ? "playlists" : "albums" });
		else leave();
	};
	/** Back to YouTube Music. With a queue the page is only hidden, so the queue and position survive. */
	const leave = () => {
		setBackOnline(false);
		if (player.q) {
			player.audioRef.current?.pause();
			hidePage.mutate();
		} else closePage.mutate({ retry: !online });
	};

	const q = query.trim().toLowerCase();
	const matches = (i: Item) => !q || `${i.title} ${i.artist} ${i.album ?? ""} ${i.collection?.title ?? ""}`.toLowerCase().includes(q);
	const group = view.page === "group" ? groups.find((g) => g.key === view.key) : undefined;

	const TrackRow = ({ item, index, list, numbered }: { item: Item; index: number; list: Item[]; numbered: boolean }) => {
		const isCurrent = current?.videoId === item.videoId;
		return (
			<li
				className={cn("group grid h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 hover:bg-foreground/5", isCurrent && "bg-foreground/[0.07]")}
				onDoubleClick={() => playList(list, index)}
			>
				<button
					type="button"
					className="relative flex size-10 items-center justify-center rounded text-sm tabular-nums text-muted-foreground"
					aria-label={`Play ${item.title}`}
					disabled={!item.url}
					onClick={() => (isCurrent ? player.toggle() : playList(list, index))}
				>
					{numbered ? (
						<span className={cn("group-hover:invisible", isCurrent && "invisible")}>{item.trackNumber ?? index + 1}</span>
					) : (
						<Cover src={item.artSrc} className="size-10 rounded group-hover:opacity-40" />
					)}
					<span className={cn("absolute inset-0 hidden items-center justify-center text-foreground group-hover:flex", isCurrent && "flex")}>
						{isCurrent && playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
					</span>
				</button>
				<div className="min-w-0">
					<div className={cn("truncate text-sm font-medium", isCurrent && "text-primary")}>{item.title}</div>
					<div className="truncate text-xs text-muted-foreground">{[item.artist, numbered ? null : (item.album ?? item.collection?.title)].filter(Boolean).join(" • ")}</div>
				</div>
				<div className="flex items-center gap-1">
					<span className="w-12 text-right text-xs tabular-nums text-muted-foreground group-hover:hidden">{fmtTime(item.durationSec)}</span>
					<div className="hidden items-center gap-0.5 group-hover:flex">
						<Button variant="ghost" size="icon-xs" title="Play next" aria-label={`Play ${item.title} next`} onClick={() => player.playNext([item.videoId])}>
							<ListStartIcon />
						</Button>
						<Button variant="ghost" size="icon-xs" title="Add to queue" aria-label={`Add ${item.title} to queue`} onClick={() => player.addToQueue([item.videoId])}>
							<ListPlusIcon />
						</Button>
						<Button variant="ghost" size="icon-xs" title="Show in folder" aria-label={`Show ${item.title} in folder`} onClick={() => showInFolder.mutate({ videoId: item.videoId })}>
							<FolderOpenIcon />
						</Button>
						<Button variant="ghost" size="icon-xs" title="Remove download" aria-label={`Remove ${item.title}`} onClick={() => setConfirming(item.videoId)}>
							<Trash2Icon />
						</Button>
					</div>
					{confirming === item.videoId && (
						<span className="flex items-center gap-1">
							<Button variant="destructive" size="xs" onClick={() => remove.mutate({ videoId: item.videoId }, { onSettled: () => setConfirming(null) })}>
								Delete file
							</Button>
							<Button variant="ghost" size="xs" onClick={() => setConfirming(null)}>
								Keep
							</Button>
						</span>
					)}
				</div>
			</li>
		);
	};

	const GroupCard = ({ g }: { g: Group }) => (
		<li className="group min-w-0">
			<div className="relative">
				<button type="button" className="block w-full" onClick={() => setView({ page: "group", key: g.key })} aria-label={`Open ${g.title}`}>
					<Cover src={g.art} className="aspect-square w-full rounded-md" />
				</button>
				<button
					type="button"
					aria-label={`Play ${g.title}`}
					className="absolute right-2 bottom-2 flex size-11 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-lg backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
					onClick={() => playList(g.items)}
				>
					<PlayIcon className="size-5 fill-current" />
				</button>
			</div>
			<button type="button" className="mt-2 block w-full text-left" onClick={() => setView({ page: "group", key: g.key })}>
				<div className="truncate text-sm font-medium">{g.title}</div>
				<div className="truncate text-xs text-muted-foreground">
					{g.kind === "album" ? "Album" : "Playlist"}
					{g.artist ? ` • ${g.artist}` : ""} • {songs(g.items.length)}
				</div>
			</button>
		</li>
	);

	const libraryGroups = view.page === "library" ? groups.filter((g) => (view.tab === "albums" ? g.kind === "album" : g.kind === "playlist") && (!q || g.items.some(matches) || g.title.toLowerCase().includes(q))) : [];
	const librarySongs = items.filter(matches).sort((a, b) => b.addedAt - a.addedAt);

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<header className="flex items-center gap-3 px-6 pt-4 pb-3">
				<Button variant="ghost" size="icon-sm" title={view.page === "group" ? "Back to Downloads" : "Back to YouTube Music"} aria-label="Back" onClick={back}>
					<ArrowLeftIcon />
				</Button>
				<h1 className="mr-auto text-xl font-semibold">Downloads</h1>
				<label className="flex h-9 w-72 max-w-[40vw] items-center gap-2 rounded-full bg-foreground/[0.07] px-3 text-sm focus-within:bg-foreground/10">
					<SearchIcon className="size-4 text-muted-foreground" />
					<input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search your downloads" value={query} onChange={(e) => setQuery(e.target.value)} />
				</label>
				<Button variant="ghost" size="sm" onClick={() => openFolder.mutate()} title="Open the downloads folder">
					<FolderOpenIcon /> Folder
				</Button>
			</header>

			{!online && (
				<div role="status" className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-foreground/[0.07] px-4 py-2 text-sm">
					<WifiOffIcon className="size-4" />
					<span className="mr-auto">You're offline. Your downloads still play.</span>
					<Button variant="outline" size="xs" onClick={() => (player.q ? retryOnline.mutate() : closePage.mutate({ retry: true }))}>
						<RefreshCwIcon /> Try YouTube Music again
					</Button>
				</div>
			)}

			{online && backOnline && (
				<div role="status" className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-foreground/[0.07] px-4 py-2 text-sm">
					<RefreshCwIcon className="size-4" />
					<span className="mr-auto">You're back online.</span>
					<Button variant="outline" size="xs" onClick={leave}>
						Go to YouTube Music
					</Button>
					<Button variant="ghost" size="icon-xs" aria-label="Dismiss" title="Dismiss" onClick={() => setBackOnline(false)}>
						<XIcon />
					</Button>
				</div>
			)}

			{(inProgress.length > 0 || failed.length > 0) && (
				<section className="mx-6 mb-2 max-h-[30vh] overflow-y-auto rounded-lg bg-foreground/[0.04] py-2" aria-label="Download queue">
					{inProgress.length > 0 && (
						<div className="px-4 py-1 text-sm">
							<div className="mb-1 flex items-center gap-2">
								<span className="font-medium">Downloading {songs(inProgress.length)}</span>
							</div>
							<ul>
								{inProgress.map((s) => (
									<li key={s.videoId} className="flex items-center gap-3 py-1">
										<span className="min-w-0 flex-1 truncate text-muted-foreground">{s.title}</span>
										<span className="relative h-1 w-28 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
											<span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]" style={{ width: `${s.state === "downloading" ? s.percent : 0}%` }} />
										</span>
										<span className="w-28 text-right text-xs text-muted-foreground">{s.state === "binaries" ? "Setting up…" : s.state === "queued" ? "Waiting" : `${s.percent}%`}</span>
										<Button variant="ghost" size="icon-xs" aria-label={`Cancel ${s.title}`} title="Cancel" onClick={() => cancel.mutate({ videoId: s.videoId })}>
											<XIcon />
										</Button>
									</li>
								))}
							</ul>
						</div>
					)}
					{failed.length > 0 && (
						<div className="px-4 py-1 text-sm">
							<div className="mb-1 flex items-center gap-2">
								<span className="mr-auto font-medium text-destructive">{songs(failed.length)} didn't download</span>
								<Button variant="outline" size="xs" onClick={() => retry.mutate({})}>
									<RefreshCwIcon /> Retry all
								</Button>
								<Button variant="ghost" size="xs" onClick={() => dismiss.mutate({})}>
									Clear
								</Button>
							</div>
							{commonError && <p className="mb-1 text-xs text-destructive">{commonError}</p>}
							<ul>
								{failed.map((s) => (
									<li key={s.videoId} className="flex items-center gap-3 py-1">
										<span className="min-w-0 flex-1 truncate text-muted-foreground">{s.title}</span>
										{!commonError && (
											<span className="max-w-[45%] truncate text-xs text-destructive" title={s.error}>
												{s.error ?? "Failed"}
											</span>
										)}
										<Button variant="ghost" size="xs" onClick={() => retry.mutate({ videoId: s.videoId })}>
											Retry
										</Button>
										<Button variant="ghost" size="icon-xs" aria-label={`Dismiss ${s.title}`} title="Dismiss" onClick={() => dismiss.mutate({ videoId: s.videoId })}>
											<XIcon />
										</Button>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			)}

			<div className="flex min-h-0 flex-1">
			<main className="min-h-0 flex-1 overflow-y-auto">
				{view.page === "group" && group ? (
					<GroupPage
						group={group}
						onPlay={(shuffle) => playList(group.items, 0, shuffle)}
						onRemoveAll={() => {
							for (const i of group.items) remove.mutate({ videoId: i.videoId });
							setView({ page: "library", tab: group.kind === "playlist" ? "playlists" : "albums" });
						}}
					>
						<ol className="px-4 pb-6">
							{group.items.filter(matches).map((item, index, list) => (
								<TrackRow key={item.videoId} item={item} index={index} list={list} numbered={group.kind === "album"} />
							))}
						</ol>
					</GroupPage>
				) : (
					<div className="px-6 pb-6">
						<div className="mb-5 flex items-center gap-2" role="tablist" aria-label="Show">
							{(["albums", "playlists", "songs"] as const).map((tab) => {
								const active = view.page === "library" && view.tab === tab;
								return (
									<button
										key={tab}
										type="button"
										role="tab"
										aria-selected={active}
										className={cn("h-8 rounded-full px-4 text-sm font-medium capitalize transition-colors", active ? "bg-foreground text-background" : "bg-foreground/[0.07] hover:bg-foreground/10")}
										onClick={() => setView({ page: "library", tab })}
									>
										{tab}
									</button>
								);
							})}
							<span className="ml-auto text-xs text-muted-foreground">
								{songs(items.length)} • {fmtSize(totalSize)}
							</span>
						</div>

						{list.isLoading ? null : !items.length ? (
							inProgress.length || failed.length ? null : (
								<div className="flex flex-col items-center gap-2 py-24 text-center">
									<MusicIcon className="size-10 text-muted-foreground" />
									<p className="text-base font-medium">Nothing downloaded yet</p>
									<p className="max-w-sm text-sm text-muted-foreground">Use Download all on an album or playlist, the download button in the player bar, or Download in a song's menu.</p>
								</div>
							)
						) : view.page === "library" && view.tab === "songs" ? (
							librarySongs.length ? (
								<ol>
									{librarySongs.map((item, index, list) => (
										<TrackRow key={item.videoId} item={item} index={index} list={list} numbered={false} />
									))}
								</ol>
							) : (
								<p className="py-16 text-center text-sm text-muted-foreground">No song matches "{query}".</p>
							)
						) : libraryGroups.length ? (
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-5 gap-y-6">
								{libraryGroups.map((g) => (
									<GroupCard key={g.key} g={g} />
								))}
							</ul>
						) : (
							<p className="py-16 text-center text-sm text-muted-foreground">
								{q
									? `No ${view.page === "library" ? view.tab : "albums"} match "${query}".`
									: `No downloaded ${view.page === "library" ? view.tab : "albums"} yet. Single songs are under Songs.`}
							</p>
						)}
					</div>
				)}
			</main>
			{queueOpen && player.q && <QueuePanel player={player} onClose={() => setQueueOpen(false)} />}
			</div>

			<PlayerBar
				player={player}
				queueOpen={queueOpen && !!player.q}
				onToggleQueue={() => setQueueOpen((o) => !o)}
				canPlay={items.length > 0}
				onVolumeWheel={(e) => changeVolume(e.deltaY < 0 ? 0.05 : -0.05)}
				extra={
					<>
						<SpeedMenu rate={rate} onRate={setRate} />
						<SleepMenu sleep={sleep} />
						<OutputMenu elements={[audioRef, player.preloadRef]} />
					</>
				}
			/>
		</div>
	);
}

function GroupPage({ group, onPlay, onRemoveAll, children }: { group: Group; onPlay: (shuffle: boolean) => void; onRemoveAll: () => void; children: React.ReactNode }) {
	const [confirm, setConfirm] = useState(false);
	const length = group.items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0);
	const backdrop: CSSProperties | undefined = group.art ? { backgroundImage: `url("${group.art}")` } : undefined;
	return (
		<div>
			<section className="relative isolate overflow-hidden px-6 pt-6 pb-8">
				{backdrop && (
					<div
						aria-hidden
						className="absolute -inset-16 -z-10 bg-cover bg-center opacity-40 blur-3xl saturate-150 [mask-image:linear-gradient(to_bottom,black_30%,transparent_85%)]"
						style={backdrop}
					/>
				)}
				<div className="flex flex-wrap items-end gap-6">
					<Cover src={group.art} className="size-52 shrink-0 rounded-lg shadow-2xl" />
					<div className="min-w-0 flex-1">
						<p className="text-sm text-muted-foreground">{group.kind === "album" ? "Album" : "Playlist"}</p>
						<h2 className="mt-1 line-clamp-2 text-3xl font-bold leading-tight">{group.title}</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{[group.artist, songs(group.items.length), length ? fmtLength(length) : null].filter(Boolean).join(" • ")}
						</p>
						<div className="mt-5 flex flex-wrap items-center gap-2">
							<Button variant="accent" size="lg" className="rounded-full px-5" onClick={() => onPlay(false)}>
								<PlayIcon className="fill-current" /> Play
							</Button>
							<Button variant="outline" size="lg" className="rounded-full px-5" onClick={() => onPlay(true)}>
								<ShuffleIcon /> Shuffle
							</Button>
							{confirm ? (
								<>
									<Button variant="destructive" size="lg" className="rounded-full px-5" onClick={onRemoveAll}>
										Delete {songs(group.items.length)}
									</Button>
									<Button variant="ghost" size="lg" className="rounded-full" onClick={() => setConfirm(false)}>
										Keep
									</Button>
								</>
							) : (
								<Button variant="ghost" size="lg" className="rounded-full" onClick={() => setConfirm(true)}>
									<Trash2Icon /> Remove download
								</Button>
							)}
						</div>
					</div>
				</div>
			</section>
			{children}
		</div>
	);
}
