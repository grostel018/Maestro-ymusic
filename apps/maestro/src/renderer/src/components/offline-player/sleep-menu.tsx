import { onSongBoundary, SLEEP_FADE_S, type SleepTimer, sleepAction, sleepLabel } from "@shared/player/sleep";
import { MoonIcon } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Boundary } from "./use-offline-player";

const MINUTES = [15, 30, 45, 60];
const SONGS = [2, 3, 5];

/**
 * The offline player's sleep timer: minutes, end of track, or after N songs. It fades over SLEEP_FADE_S, then pauses
 * and restores the volume. `gain` goes to the player; `onBoundary` counts songs.
 */
export function useSleepTimer(audioRef: RefObject<HTMLAudioElement | null>) {
	const [timer, setTimer] = useState<SleepTimer>({ kind: "off" });
	const [gain, setGain] = useState(1);
	const timerRef = useRef(timer);
	timerRef.current = timer;
	const fadeStart = useRef<number | null>(null);

	const stop = useCallback(() => {
		audioRef.current?.pause();
		fadeStart.current = null;
		setGain(1);
		setTimer({ kind: "off" });
	}, [audioRef]);

	useEffect(() => {
		if (timer.kind === "off") {
			fadeStart.current = null;
			setGain(1);
			return;
		}
		const id = setInterval(() => {
			const el = audioRef.current;
			if (!el) return;
			const remaining = Number.isFinite(el.duration) ? (el.duration - el.currentTime) / (el.playbackRate || 1) : Number.POSITIVE_INFINITY;
			const action = sleepAction(timerRef.current, Date.now(), remaining, fadeStart.current !== null);
			if (action === "pause") return stop();
			if (action === "fade") fadeStart.current = Date.now();
			if (fadeStart.current !== null && !el.paused) setGain(Math.max(0, 1 - (Date.now() - fadeStart.current) / (SLEEP_FADE_S * 1000)));
		}, 250);
		return () => clearInterval(id);
	}, [timer, audioRef, stop]);

	/** For the player: a song ended or was skipped (counts) or the user went back. True = stop here. */
	const onBoundary = useCallback(
		(b: Boundary) => {
			const r = onSongBoundary(timerRef.current, b);
			if (r.timer !== timerRef.current) {
				timerRef.current = r.timer; // before the re-render, so a second boundary in the same tick counts too
				setTimer(r.timer);
			}
			if (r.stop) {
				fadeStart.current = null;
				setGain(1);
			}
			return r.stop;
		},
		[],
	);

	const set = useCallback((t: SleepTimer) => {
		fadeStart.current = null;
		setGain(1);
		setTimer(t);
	}, []);

	return { timer, gain, set, onBoundary };
}

export function SleepMenu({ sleep }: { sleep: ReturnType<typeof useSleepTimer> }) {
	const [open, setOpen] = useState(false);
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (sleep.timer.kind !== "at") return;
		const id = setInterval(() => setNow(Date.now()), 15_000);
		return () => clearInterval(id);
	}, [sleep.timer.kind]);
	const on = sleep.timer.kind !== "off";
	const label = sleepLabel(sleep.timer, now);
	const pick = (t: SleepTimer) => {
		sleep.set(t);
		setOpen(false);
	};
	const item = (text: string, t: SleepTimer, active: boolean) => (
		<button key={text} type="button" className={cn("w-full rounded px-2 py-1.5 text-left text-sm hover:bg-foreground/5", active && "text-primary")} onClick={() => pick(t)}>
			{text}
		</button>
	);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} title={label} className={cn(on && "text-primary")} />}>
				<MoonIcon />
			</PopoverTrigger>
			<PopoverContent side="top" className="w-52 gap-0.5 p-1.5">
				<p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{on ? label : "Sleep timer"}</p>
				{item("Off", { kind: "off" }, !on)}
				{MINUTES.map((m) => item(`${m} minutes`, { kind: "at", endsAt: Date.now() + m * 60_000 }, false))}
				{item("End of this song", { kind: "end-of-track" }, sleep.timer.kind === "end-of-track")}
				{SONGS.map((n) => item(`After ${n} songs`, { kind: "after-songs", left: n }, false))}
			</PopoverContent>
		</Popover>
	);
}
