import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** The next preset up (+1) or down (-1) from `rate`. */
export function stepSpeed(rate: number, dir: 1 | -1): number {
	if (dir > 0) return SPEEDS.find((s) => s > rate + 1e-6) ?? SPEEDS[SPEEDS.length - 1];
	return [...SPEEDS].reverse().find((s) => s < rate - 1e-6) ?? SPEEDS[0];
}

const fmt = (r: number) => `${Number(r.toFixed(2))}×`;

/** Speed for the offline player only (not saved, per spec); pitch follows the shared `player.keepPitch` setting. */
export function SpeedMenu({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={<Button variant="ghost" size="sm" aria-label={`Playback speed ${fmt(rate)}`} title="Playback speed" className={cn("w-11 px-0 tabular-nums", rate !== 1 && "text-primary")} />}
			>
				{fmt(rate)}
			</PopoverTrigger>
			<PopoverContent side="top" className="w-36 gap-0.5 p-1.5">
				{SPEEDS.map((s) => (
					<button
						key={s}
						type="button"
						className={cn("w-full rounded px-2 py-1.5 text-left text-sm tabular-nums hover:bg-foreground/5", s === rate && "text-primary")}
						onClick={() => {
							onRate(s);
							setOpen(false);
						}}
					>
						{s === 1 ? "Normal" : fmt(s)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
