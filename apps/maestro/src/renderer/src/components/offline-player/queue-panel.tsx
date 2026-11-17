import { GripVerticalIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfflinePlayer } from "./use-offline-player";

/** Up next: what's playing and what follows. Drag to reorder, click to jump, X to remove. */
export function QueuePanel({ player, onClose }: { player: OfflinePlayer; onClose: () => void }) {
	const { q, byId } = player;
	const [drag, setDrag] = useState<number | null>(null);
	if (!q) return null;
	return (
		<aside aria-label="Up next" className="flex w-80 shrink-0 flex-col border-l border-foreground/10">
			<div className="flex items-center gap-2 px-4 pt-4 pb-2">
				<h2 className="mr-auto text-sm font-semibold">Up next</h2>
				<span className="text-xs text-muted-foreground">
					{q.pos + 1} / {q.order.length}
				</span>
				<Button variant="ghost" size="icon-xs" aria-label="Close Up next" onClick={onClose}>
					<XIcon />
				</Button>
			</div>
			<ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
				{q.order.map((id, i) => {
					const item = byId.get(id);
					if (!item) return null;
					const isCurrent = i === q.pos;
					return (
						<li
							key={`${id}-${i}`}
							draggable
							onDragStart={() => setDrag(i)}
							onDragOver={(e) => e.preventDefault()}
							onDrop={() => {
								if (drag !== null) player.move(drag, i);
								setDrag(null);
							}}
							className={cn("group flex h-11 items-center gap-2 rounded-md px-2 hover:bg-foreground/5", isCurrent && "bg-foreground/[0.07]", i < q.pos && "opacity-50")}
						>
							<GripVerticalIcon className="size-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
							<button type="button" className="min-w-0 flex-1 text-left" onClick={() => player.jumpTo(i)} aria-label={`Play ${item.title}`}>
								<div className={cn("truncate text-sm", isCurrent && "font-medium text-primary")}>{item.title}</div>
								<div className="truncate text-xs text-muted-foreground">{item.artist}</div>
							</button>
							<Button
								variant="ghost"
								size="icon-xs"
								className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
								aria-label={`Remove ${item.title} from Up next`}
								onClick={() => player.removeAt(i)}
							>
								<XIcon />
							</Button>
						</li>
					);
				})}
			</ol>
		</aside>
	);
}
