import { DEFAULT_DEVICE, type OutputDevice, outputMenu, resolveSink } from "@plugins/youtube/audio-output.logic";
import { SpeakerIcon } from "lucide-react";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsState } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

async function listOutputs() {
	try {
		return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
	} catch {
		return [];
	}
}

/** The speaker for the offline player: the same `player.outputDevice` setting the online player uses. */
export function OutputMenu({ elements }: { elements: RefObject<HTMLAudioElement | null>[] }) {
	const [wanted, setWanted] = useSettingsState<string>("player.outputDevice", DEFAULT_DEVICE);
	const [devices, setDevices] = useState<OutputDevice[]>([]);
	const [open, setOpen] = useState(false);

	const apply = useCallback(async () => {
		const raw = await listOutputs();
		setDevices(outputMenu(raw));
		const { sinkId } = resolveSink(wanted, raw);
		for (const ref of elements) {
			const el = ref.current as SinkElement | null;
			if (el?.setSinkId && (el as { sinkId?: string }).sinkId !== sinkId) await el.setSinkId(sinkId).catch(() => undefined);
		}
	}, [wanted, elements]);

	useEffect(() => {
		void apply();
		navigator.mediaDevices?.addEventListener?.("devicechange", apply);
		return () => navigator.mediaDevices?.removeEventListener?.("devicechange", apply);
	}, [apply]);

	const label = devices.find((d) => d.deviceId === wanted)?.label ?? "System default";
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Speaker: ${label}`} title={`Speaker: ${label}`} className={cn(wanted !== DEFAULT_DEVICE && "text-primary")} />}>
				<SpeakerIcon />
			</PopoverTrigger>
			<PopoverContent side="top" className="w-64 gap-0.5 p-1.5">
				{devices.map((d) => (
					<button
						key={d.deviceId}
						type="button"
						className={cn("w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-foreground/5", d.deviceId === wanted && "text-primary")}
						onClick={() => {
							setWanted(d.deviceId);
							setOpen(false);
						}}
					>
						{d.label}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
