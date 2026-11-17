import { ListMusicIcon, MusicIcon, PauseIcon, PlayIcon, Repeat1Icon, RepeatIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfflinePlayer } from "./use-offline-player";

const fmtTime = (sec: number | undefined) => {
	if (!sec || !Number.isFinite(sec)) return "0:00";
	const s = Math.floor(sec);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Art({ src }: { src: string | null }) {
	const [failed, setFailed] = useState(false);
	return src && !failed ? (
		<img src={src} alt="" className="size-12 shrink-0 rounded object-cover" onError={() => setFailed(true)} draggable={false} />
	) : (
		<div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
			<MusicIcon className="size-4" />
		</div>
	);
}

/** The offline player bar: song, transport with shuffle and repeat, seek, Up next, volume, and `extra` menus. */
export function PlayerBar({
	player,
	queueOpen,
	onToggleQueue,
	extra,
	canPlay,
	onVolumeWheel,
}: {
	player: OfflinePlayer;
	queueOpen: boolean;
	onToggleQueue: () => void;
	extra?: ReactNode;
	canPlay: boolean;
	onVolumeWheel?: (e: React.WheelEvent) => void;
}) {
	const { current, q, playing, time, volume, muted } = player;
	const repeat = q?.repeat ?? "off";
	const repeatLabel = repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat all" : "Repeat one";
	return (
		<footer className="grid h-[4.5rem] grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-4 border-t border-foreground/10 px-4">
			<div className="flex min-w-0 items-center gap-3">
				{current ? (
					<>
						<Art src={current.artSrc} />
						<div className="min-w-0">
							<div className="truncate text-sm font-medium">{current.title}</div>
							<div className="truncate text-xs text-muted-foreground">{current.artist}</div>
						</div>
					</>
				) : (
					<span className="text-xs text-muted-foreground">Pick something to play</span>
				)}
			</div>
			<div className="flex flex-col items-center gap-1">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={q?.shuffle ? "Shuffle on" : "Shuffle off"}
						aria-pressed={!!q?.shuffle}
						title={q?.shuffle ? "Shuffle on" : "Shuffle off"}
						disabled={!q}
						className={cn(q?.shuffle && "text-primary")}
						onClick={player.toggleShuffle}
					>
						<ShuffleIcon />
					</Button>
					<Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={!current} onClick={player.prev}>
						<SkipBackIcon className="fill-current" />
					</Button>
					<button
						type="button"
						aria-label={playing ? "Pause" : "Play"}
						disabled={!canPlay}
						onClick={player.toggle}
						className="flex size-9 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40"
					>
						{playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="ml-0.5 size-4 fill-current" />}
					</button>
					<Button variant="ghost" size="icon-sm" aria-label="Next" disabled={!current} onClick={player.next}>
						<SkipForwardIcon className="fill-current" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={repeatLabel}
						aria-pressed={repeat !== "off"}
						title={repeatLabel}
						disabled={!q}
						className={cn(repeat !== "off" && "text-primary")}
						onClick={player.cycleRepeat}
					>
						{repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
					</Button>
				</div>
				<div className="flex w-full max-w-xl items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
					<span className="w-9 text-right">{fmtTime(time.now)}</span>
					<input
						type="range"
						aria-label="Seek"
						className="h-1 flex-1 accent-primary"
						min={0}
						max={time.total || 0}
						step={1}
						value={time.now}
						disabled={!current}
						onChange={(e) => player.seek(Number(e.target.value))}
					/>
					<span className="w-9">{fmtTime(time.total)}</span>
				</div>
			</div>
			<div className="flex items-center justify-end gap-1">
				{extra}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Up next"
					aria-pressed={queueOpen}
					title="Up next"
					disabled={!q}
					className={cn(queueOpen && "text-primary")}
					onClick={onToggleQueue}
				>
					<ListMusicIcon />
				</Button>
				<div className="flex items-center gap-1" onWheel={onVolumeWheel}>
					<Button variant="ghost" size="icon-sm" aria-label={muted ? "Unmute" : "Mute"} onClick={() => player.setMuted((m) => !m)}>
						{muted || volume === 0 ? <VolumeXIcon /> : <Volume2Icon />}
					</Button>
					<input
						type="range"
						aria-label="Volume"
						className="h-1 w-24 accent-primary"
						min={0}
						max={1}
						step={0.01}
						value={muted ? 0 : volume}
						onChange={(e) => {
							player.setVolume(Number(e.target.value));
							player.setMuted(false);
						}}
					/>
				</div>
			</div>
			<audio {...player.audioProps} />
			<audio ref={player.preloadRef} preload="auto" muted />
		</footer>
	);
}
