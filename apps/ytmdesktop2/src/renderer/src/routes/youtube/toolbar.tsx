import { cn } from "@renderer/lib/utils";
import { resolveArtworkUrl } from "@shared/track/thumbnail";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon, MaximizeIcon, Minimize2, SearchIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import { ToolbarOptions } from "@/components/toolbar-options";
import { Spinner } from "@/components/ui/spinner";
import { useNavigation } from "@/hooks/use-navigation";
import { useMainWindowState } from "@/hooks/use-settings";
import { useTrack, useTrackProgress } from "@/hooks/use-track";
import { useUpdater } from "@/hooks/use-updater";
import { useWindowControls } from "@/hooks/use-window-controls";
import { useSurfaceBackground } from "@/lib/surface";

export const Route = createFileRoute("/youtube/toolbar")({
	component: YoutubeToolbarPage,
});

function YoutubeToolbarPage() {
	const appVersion = useMemo(() => window.api.version, []);
	const isDarwin = useMemo(() => window.app.platform === "darwin", []);
	const [state] = useMainWindowState();
	const track = useTrack();
	const { updateInfo, downloaded, progress, isPending: updatePending, status, runUpdate } = useUpdater();
	const { minimize, maximize, quit } = useWindowControls();
	const { goback, goforward, playerPage, search } = useNavigation();
	const playback = useTrackProgress();
	const surface = useSurfaceBackground();

	const title = useMemo(() => track?.video?.title ?? null, [track]);
	const artist = track?.video?.author ?? "";
	const artwork = resolveArtworkUrl(track);
	const percent = playback.duration > 0 ? Math.min(100, (playback.progress / playback.duration) * 100) : 0;
	const canGoForward = (state?.navigation as { canGoForward?: boolean } | null | undefined)?.canGoForward ?? false;
	const canGoBack = useMemo(() => {
		const nav = state?.navigation;
		return typeof nav === "object" && nav ? nav.canGoBack : false;
	}, [state?.navigation]);

	return (
		<div className="h-full overflow-hidden">
			<div style={surface} className={`relative flex h-10 items-stretch justify-between gap-2 px-2 select-none ${isDarwin ? "pl-20" : ""}`}>
				<div className="flex items-center gap-0.5 self-center">
					<button
						type="button"
						title="Back"
						className={cn("control-button cursor-pointer", !canGoBack && "disabled")}
						disabled={!canGoBack}
						onClick={() => void goback()}
					>
						<ArrowLeftIcon />
					</button>
					<button
						type="button"
						title="Forward"
						className={cn("control-button cursor-pointer", !canGoForward && "disabled")}
						disabled={!canGoForward}
						onClick={() => void goforward()}
					>
						<ArrowRightIcon />
					</button>
					<button type="button" title="Search" className="control-button cursor-pointer" onClick={() => void search()}>
						<SearchIcon />
					</button>
				</div>
				<div className="drag flex flex-1 items-center gap-2">
					{!isDarwin && (
						<div className="flex items-center gap-1">
							<div className="-mt-px flex-none text-xs">YouTube Music for Desktop</div>
							{appVersion !== undefined && <div className="text-xs text-white opacity-30">v{appVersion}</div>}
						</div>
					)}
				</div>
				{title && (
					// The "LCD": the playing track, centred in the window; a click opens the player page.
					<button
						type="button"
						title="Open the player"
						onClick={() => void playerPage()}
						className="no-drag absolute top-1/2 left-1/2 flex h-7 max-w-[40%] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-2 overflow-hidden rounded-md bg-white/10 pr-3 text-xs hover:bg-white/15"
					>
						{artwork ? <img src={artwork} alt="" className="h-7 w-7 flex-none object-cover" /> : null}
						<span className="flex min-w-0 flex-col items-start leading-tight">
							<span className="w-full truncate text-left font-medium">{title}</span>
							{artist ? <span className="w-full truncate text-left text-[10px] opacity-60">{artist}</span> : null}
						</span>
						<span className="absolute bottom-0 left-0 h-px bg-white/70" style={{ width: `${percent}%` }} />
					</button>
				)}
				<div className="flex items-center gap-2">
					{isDarwin && appVersion && (
						<>
							<div className="text-xs text-white opacity-30">v{appVersion}</div>
							<div className="h-6 w-px bg-gray-600" />
						</>
					)}
					{updateInfo && (
						<button
							type="button"
							className={`flex h-7 cursor-pointer items-center gap-2 truncate rounded px-3 text-xs transition duration-100 ease-out ${
								status === "available" ? "bg-green-500 text-white" : status === "ready" || downloaded ? "text-green-500" : ""
							}`}
							disabled={updatePending}
							onClick={() => void runUpdate()}
						>
							{status === "downloading" && progress?.percent ? (
								<>
									<Spinner size="sm" />
									<span>
										Downloading Update v{updateInfo.version}... {progress.percent.toFixed(0).padStart(5)}%
									</span>
								</>
							) : status === "installing" ? (
								<>
									<Spinner size="sm" />
									<span>Installing Update v{updateInfo.version}…</span>
								</>
							) : (
								<span className="truncate text-ellipsis">New Update v{updateInfo.version}</span>
							)}
						</button>
					)}
					<ToolbarOptions />
					{!isDarwin && (
						<>
							<div className="h-6 w-px bg-gray-600" />
							<div className="flex items-center gap-1">
								<button type="button" className="control-button" onClick={() => void minimize()}>
									<Minimize2 />
								</button>
								<button type="button" className="control-button" onClick={() => void maximize()}>
									<MaximizeIcon />
								</button>
								<button type="button" className="control-button control-button-danger" onClick={() => void quit()}>
									<XIcon />
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
