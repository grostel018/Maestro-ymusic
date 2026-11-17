import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/player/downloads")({
	component: DownloadsSettingsPage,
});

function DownloadsSettingsPage() {
	const utils = trpc.useUtils();
	const folder = trpc.downloads.folder.useQuery();
	const [note, setNote] = useState("");
	const choose = trpc.downloads.chooseFolder.useMutation({
		onSuccess: (to) => {
			if (to) setNote(`Downloads now go to ${to}.`);
			void utils.downloads.folder.invalidate();
		},
		onError: (e) => setNote(e instanceof Error ? e.message : "That didn't work."),
	});
	const openFolder = trpc.downloads.openFolder.useMutation();
	const openPage = trpc.downloads.openPage.useMutation();

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Downloads</CardTitle>
					<CardDescription>
						Songs you download are saved as audio files with their cover and tags, so any player can use them, and they play in Maestro's Downloads page
						with no internet. For your own personal use: downloading goes against YouTube's terms.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="text-sm">
						<span className="text-muted-foreground">Folder: </span>
						<span className="break-all">{folder.data ?? "…"}</span>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={() => choose.mutate({ move: true })} disabled={choose.isLoading}>
							Change folder and move my downloads
						</Button>
						<Button variant="ghost" size="sm" onClick={() => choose.mutate({ move: false })} disabled={choose.isLoading}>
							Change folder only
						</Button>
						<Button variant="ghost" size="sm" onClick={() => openFolder.mutate()}>
							Open folder
						</Button>
						<Button variant="accent" size="sm" onClick={() => openPage.mutate()}>
							Open Downloads
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						The first download also fetches the downloader (yt-dlp, ffmpeg and Deno, about 150 MB) from their official releases. It is checked against their
						published checksums and keeps itself up to date.
					</p>
					{note && <p className="text-xs">{note}</p>}
				</CardContent>
			</Card>
		</div>
	);
}
