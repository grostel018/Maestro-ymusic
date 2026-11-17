import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, FolderOpenIcon, MusicIcon, PauseIcon, PlayIcon, RefreshCwIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon, Trash2Icon, WifiOffIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/downloads")({
	component: DownloadsPage,
});

type Item = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
	url: string | null;
	artSrc: string | null;
	size: number;
};

const fmtTime = (sec: number | undefined) => {
	if (!sec || !Number.isFinite(sec)) return "";
	const s = Math.floor(sec);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

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
	const pauseYtm = trpc.track.pause.useMutation();

	const items = (list.data ?? []) as Item[];
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? items.filter((i) => `${i.title} ${i.artist} ${i.album ?? ""}`.toLowerCase().includes(q)) : items;
	}, [items, query]);
	const total = items.reduce((sum, i) => sum + i.size, 0);
	const inProgress = (status.data ?? []).filter((s) => s.state !== "done" && s.state !== "error");
	const failed = (status.data ?? []).filter((s) => s.state === "error");
	/** When every failure has the same cause (the downloader couldn't be set up), say it once. */
	const commonError = failed.length > 1 && failed.every((f) => f.error === failed[0].error) ? failed[0].error : null;

	// The offline player: a queue of the list's order (or shuffled), one <audio>.
	const audio = useRef<HTMLAudioElement>(null);
	const [order, setOrder] = useState<string[]>([]);
	const [pos, setPos] = useState(-1);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState({ now: 0, total: 0 });
	const current = pos >= 0 ? items.find((i) => i.videoId === order[pos]) : undefined;
	/** Files in a row that would not play: stop instead of skipping forever. */
	const failures = useRef(0);

	const start = (ids: string[], at = 0) => {
		setOrder(ids);
		setPos(at);
	};
	const playAll = (shuffle: boolean) => {
		const ids = filtered.filter((i) => i.url).map((i) => i.videoId);
		if (shuffle) {
			for (let i = ids.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[ids[i], ids[j]] = [ids[j], ids[i]];
			}
		}
		if (ids.length) start(ids);
	};
	const step = (by: number) => setPos((p) => (order.length ? (p + by + order.length) % order.length : -1));

	useEffect(() => {
		const el = audio.current;
		if (!el || !current?.url) return;
		if (el.src !== current.url) el.src = current.url;
		// Only one player at a time: YouTube Music stops while a download plays.
		pauseYtm.mutate();
		void el.play().catch(() => setPlaying(false));
		if ("mediaSession" in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: current.title,
				artist: current.artist,
				album: current.album ?? "",
				artwork: current.artSrc ? [{ src: current.artSrc, sizes: "512x512", type: "image/jpeg" }] : [],
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [current?.videoId]);

	useEffect(() => {
		if (!("mediaSession" in navigator)) return;
		const ms = navigator.mediaSession;
		ms.setActionHandler("play", () => void audio.current?.play());
		ms.setActionHandler("pause", () => audio.current?.pause());
		ms.setActionHandler("nexttrack", () => step(1));
		ms.setActionHandler("previoustrack", () => step(-1));
		return () => {
			for (const a of ["play", "pause", "nexttrack", "previoustrack"] as const) ms.setActionHandler(a, null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [order.length]);

	const toggle = () => {
		const el = audio.current;
		if (!el) return;
		if (!current) return playAll(false);
		if (el.paused) void el.play();
		else el.pause();
	};

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
				<Button variant="ghost" size="icon-sm" title="Back to YouTube Music" aria-label="Back to YouTube Music" onClick={() => closePage.mutate({ retry: !online })}>
					<ArrowLeftIcon />
				</Button>
				<h1 className="mr-auto text-base font-medium">Downloads</h1>
				<Input className="h-8 w-56 max-w-full" placeholder="Search downloads" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search downloads" />
				<Button variant="accent" size="sm" disabled={!filtered.length} onClick={() => playAll(false)}>
					<PlayIcon /> Play
				</Button>
				<Button variant="outline" size="sm" disabled={!filtered.length} onClick={() => playAll(true)}>
					<ShuffleIcon /> Shuffle
				</Button>
				<Button variant="ghost" size="sm" onClick={() => openFolder.mutate()} title="Open the downloads folder">
					<FolderOpenIcon /> Folder
				</Button>
			</header>

			{!online && (
				<div role="status" className="flex items-center gap-2 bg-muted px-4 py-2 text-sm">
					<WifiOffIcon className="size-4" />
					<span className="mr-auto">You're offline. Your downloaded songs still play.</span>
					<Button variant="outline" size="xs" onClick={() => closePage.mutate({ retry: true })}>
						<RefreshCwIcon /> Retry YouTube Music
					</Button>
				</div>
			)}

			{(inProgress.length > 0 || failed.length > 0) && (
				<section className="max-h-[40vh] overflow-y-auto border-b border-border" aria-label="Download queue">
					{inProgress.length > 0 && (
						<>
							<h2 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Downloading · {inProgress.length}</h2>
							<ul>
								{inProgress.map((s) => (
									<li key={s.videoId} className="flex items-center gap-3 px-4 py-1.5 text-sm">
										<span className="min-w-0 flex-1 truncate">
											{s.title}
											{s.artist ? <span className="text-muted-foreground"> · {s.artist}</span> : null}
										</span>
										<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
											{s.state === "binaries" ? "Setting up the downloader…" : s.state === "queued" ? "Waiting" : `${s.percent}%`}
										</span>
										<Button variant="ghost" size="xs" onClick={() => cancel.mutate({ videoId: s.videoId })}>
											Cancel
										</Button>
									</li>
								))}
							</ul>
						</>
					)}
					{failed.length > 0 && (
						<>
							<div className="flex items-center gap-2 px-4 pt-3 pb-1">
								<h2 className="mr-auto text-xs font-medium uppercase tracking-wide text-destructive">Failed · {failed.length}</h2>
								<Button variant="outline" size="xs" onClick={() => retry.mutate({})}>
									<RefreshCwIcon /> Retry all
								</Button>
								<Button variant="ghost" size="xs" onClick={() => dismiss.mutate({})}>
									Clear
								</Button>
							</div>
							{commonError && <p className="px-4 pb-1 text-xs text-destructive">{commonError}</p>}
							<ul>
								{failed.map((s) => (
									<li key={s.videoId} className="flex items-center gap-3 px-4 py-1.5 text-sm">
										<span className="min-w-0 flex-1 truncate">
											{s.title}
											{s.artist ? <span className="text-muted-foreground"> · {s.artist}</span> : null}
										</span>
										{!commonError && <span className="max-w-[45%] shrink truncate text-xs text-destructive" title={s.error}>{s.error ?? "Failed"}</span>}
										<Button variant="ghost" size="xs" onClick={() => retry.mutate({ videoId: s.videoId })}>
											Retry
										</Button>
										<Button variant="ghost" size="icon-xs" aria-label={`Dismiss ${s.title}`} title="Dismiss" onClick={() => dismiss.mutate({ videoId: s.videoId })}>
											<XIcon />
										</Button>
									</li>
								))}
							</ul>
						</>
					)}
				</section>
			)}

			<main className="min-h-0 flex-1 overflow-y-auto">
				{list.isLoading ? null : !items.length && (inProgress.length || failed.length) ? null : !items.length ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
						<MusicIcon className="size-8" />
						<p>No downloads yet.</p>
						<p>Use the download button in the player bar, or "Download" in a song's menu.</p>
					</div>
				) : !filtered.length ? (
					<p className="p-8 text-center text-sm text-muted-foreground">Nothing matches "{query}".</p>
				) : (
					<ul aria-label="Downloaded songs">
						{filtered.map((item) => {
							const isCurrent = current?.videoId === item.videoId;
							return (
								<li key={item.videoId} className={cn("group flex items-center gap-3 px-4 py-2 hover:bg-muted/50", isCurrent && "bg-muted")}>
									<button
										type="button"
										className="flex min-w-0 flex-1 items-center gap-3 text-left"
										disabled={!item.url}
										onClick={() => start(filtered.filter((i) => i.url).map((i) => i.videoId), filtered.filter((i) => i.url).findIndex((i) => i.videoId === item.videoId))}
										title={`Play ${item.title}`}
									>
										{item.artSrc ? <img src={item.artSrc} alt="" className="size-10 shrink-0 rounded object-cover" /> : <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted"><MusicIcon className="size-4" /></div>}
										<span className="flex min-w-0 flex-col">
											<span className={cn("truncate text-sm", isCurrent && "text-primary")}>{item.title}</span>
											<span className="truncate text-xs text-muted-foreground">{[item.artist, item.album].filter(Boolean).join(" • ")}</span>
										</span>
									</button>
									<span className="shrink-0 text-xs text-muted-foreground">{fmtTime(item.durationSec)}</span>
									<Button variant="ghost" size="icon-xs" title="Show in folder" aria-label={`Show ${item.title} in folder`} onClick={() => showInFolder.mutate({ videoId: item.videoId })}>
										<FolderOpenIcon />
									</Button>
									{confirming === item.videoId ? (
										<>
											<Button variant="destructive" size="xs" onClick={() => remove.mutate({ videoId: item.videoId }, { onSettled: () => setConfirming(null) })}>
												Delete file
											</Button>
											<Button variant="ghost" size="xs" onClick={() => setConfirming(null)}>
												Keep
											</Button>
										</>
									) : (
										<Button variant="ghost" size="icon-xs" title="Remove download" aria-label={`Remove ${item.title}`} onClick={() => setConfirming(item.videoId)}>
											<Trash2Icon />
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</main>

			<footer className="flex items-center gap-3 border-t border-border px-4 py-2">
				<Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={!current} onClick={() => step(-1)}>
					<SkipBackIcon />
				</Button>
				<Button variant="accent" size="icon-sm" aria-label={playing ? "Pause" : "Play"} disabled={!items.length} onClick={toggle}>
					{playing ? <PauseIcon /> : <PlayIcon />}
				</Button>
				<Button variant="ghost" size="icon-sm" aria-label="Next" disabled={!current} onClick={() => step(1)}>
					<SkipForwardIcon />
				</Button>
				<span className="min-w-0 flex-1 truncate text-sm">{current ? `${current.title} · ${current.artist}` : `${items.length} songs · ${fmtSize(total)}`}</span>
				{current && (
					<>
						<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTime(time.now)}</span>
						<input
							type="range"
							aria-label="Seek"
							className="w-40 accent-primary"
							min={0}
							max={time.total || 0}
							step={1}
							value={time.now}
							onChange={(e) => {
								if (audio.current) audio.current.currentTime = Number(e.target.value);
							}}
						/>
						<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTime(time.total)}</span>
					</>
				)}
				<audio
					ref={audio}
					onPlay={() => {
						failures.current = 0;
						setPlaying(true);
					}}
					onPause={() => setPlaying(false)}
					onEnded={() => (pos < order.length - 1 ? step(1) : setPlaying(false))}
					onTimeUpdate={(e) => setTime({ now: e.currentTarget.currentTime, total: e.currentTarget.duration || 0 })}
					onError={() => {
						failures.current += 1;
						if (failures.current < order.length) step(1);
						else setPlaying(false);
					}}
				/>
			</footer>
		</div>
	);
}
