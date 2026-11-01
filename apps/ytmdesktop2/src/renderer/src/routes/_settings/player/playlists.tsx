import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/player/playlists")({
	component: PlaylistsPage,
});

const MAX_FILE_BYTES = 20_000_000;
const errorText = (err: unknown) => (err instanceof Error ? err.message : "That didn't work.");

function PlaylistsPage() {
	const utils = trpc.useUtils();
	// Matching an import runs in the background: keep the "found" counts moving while it does.
	const list = trpc.playlists.list.useQuery(undefined, { refetchInterval: (data) => (data?.matching ? 2000 : false) });
	const [note, setNote] = useState("");
	const [name, setName] = useState("");
	const [open, setOpen] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const file = useRef<HTMLInputElement>(null);

	const refresh = () => void utils.playlists.list.invalidate();
	const opts = { onSuccess: refresh, onError: (e: unknown) => setNote(errorText(e)) };
	const create = trpc.playlists.create.useMutation(opts);
	const rename = trpc.playlists.rename.useMutation(opts);
	const remove = trpc.playlists.remove.useMutation(opts);
	const removeTrack = trpc.playlists.removeTrack.useMutation(opts);
	const addCurrent = trpc.playlists.addCurrent.useMutation({
		...opts,
		onSuccess: (added) => {
			refresh();
			setNote(added ? "Added the playing song." : "Nothing playing, or it's already in there.");
		},
	});
	const saveQueue = trpc.playlists.saveQueue.useMutation({
		...opts,
		onSuccess: () => {
			refresh();
			setNote("Saved the queue as a playlist.");
		},
	});
	const importFile = trpc.playlists.importFile.useMutation({
		...opts,
		onSuccess: (r) => {
			refresh();
			setNote(`Imported ${r.tracks} songs into ${r.names.join(", ")}. Songs without a link are being matched on YouTube Music.`);
		},
	});
	const play = trpc.playlists.play.useMutation({ onError: (e) => setNote(errorText(e)) });
	const smart = trpc.playlists.smartShuffle.useMutation({
		onSuccess: (r) => setNote(`Smart shuffle: ${r.own} of your songs and ${r.recommended} recommendations.`),
		onError: (e) => setNote(errorText(e)),
	});

	const onFile = async (f: File | undefined) => {
		if (!f) return;
		if (f.size > MAX_FILE_BYTES) {
			setNote("That file is too big for a playlist.");
			return;
		}
		importFile.mutate({ fileName: f.name, text: await f.text() });
	};

	const playlists = list.data?.playlists ?? [];
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Smart shuffle</CardTitle>
					<CardDescription>Your liked songs, most played songs and playlists, shuffled, with a new recommendation after every third song.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button size="sm" disabled={smart.isLoading} onClick={() => smart.mutate()}>
						{smart.isLoading ? "Starting…" : "Start smart shuffle"}
					</Button>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Playlists</CardTitle>
					<CardDescription>
						Kept on this computer, and played through YouTube Music. Import a CSV, an M3U, a list of links or a Spotify data export. Add the playing song from the playlist
						button in the player bar.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<Input className="w-56" placeholder="New playlist name" value={name} aria-label="New playlist name" onChange={(e) => setName(e.target.value)} />
						<Button
							size="sm"
							onClick={() => {
								create.mutate({ name });
								setName("");
							}}
						>
							Create
						</Button>
						<Button size="sm" variant="outline" disabled={saveQueue.isLoading} onClick={() => saveQueue.mutate({ name })}>
							Save queue
						</Button>
						<Button size="sm" variant="outline" disabled={importFile.isLoading} onClick={() => file.current?.click()}>
							Import file
						</Button>
						<input
							ref={file}
							type="file"
							accept=".csv,.m3u,.m3u8,.txt,.json"
							className="hidden"
							aria-label="Playlist file"
							onChange={(e) => {
								void onFile(e.target.files?.[0]);
								e.target.value = "";
							}}
						/>
					</div>
					{note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
					{list.data?.matching ? <p className="text-muted-foreground text-xs">Matching imported songs on YouTube Music…</p> : null}
					{!playlists.length ? <p className="text-muted-foreground text-sm">No playlists yet.</p> : null}
					<ul className="flex flex-col gap-3">
						{playlists.map((p) => (
							<li key={p.id} className="flex flex-col gap-2 rounded-lg border p-3">
								<div className="flex flex-wrap items-center gap-2">
									<Input className="w-48" defaultValue={p.name} aria-label="Playlist name" onBlur={(e) => e.target.value !== p.name && rename.mutate({ id: p.id, name: e.target.value })} />
									<span className="text-muted-foreground text-xs tabular-nums">{p.found === p.tracks.length ? `${p.tracks.length} ${p.tracks.length === 1 ? "song" : "songs"}` :`${p.found} of ${p.tracks.length} songs found`}</span>
									<span className="flex-1" />
									<Button size="xs" onClick={() => play.mutate({ id: p.id })}>
										Play
									</Button>
									<Button size="xs" variant="outline" onClick={() => play.mutate({ id: p.id, shuffle: true })}>
										Shuffle
									</Button>
									<Button size="xs" variant="outline" onClick={() => addCurrent.mutate({ id: p.id })}>
										Add playing song
									</Button>
									<Button size="xs" variant="outline" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
										Songs
									</Button>
									<Button
										size="xs"
										variant={confirming === p.id ? "destructive" : "outline"}
										onClick={() => {
											if (confirming !== p.id) {
												setConfirming(p.id);
												return;
											}
											setConfirming(null);
											remove.mutate({ id: p.id });
										}}
									>
										{confirming === p.id ? "Really delete?" : "Delete"}
									</Button>
								</div>
								{open === p.id ? (
									<ol className="flex max-h-72 flex-col gap-1 overflow-y-auto">
										{p.tracks.map((t, i) => (
											<li key={`${t.videoId ?? t.title}-${i}`} className="flex items-center gap-2 text-sm">
												<span className="min-w-0 flex-1 truncate">
													<span className="font-medium">{t.title || t.videoId}</span>
													{t.artist ? <span className="text-muted-foreground"> · {t.artist}</span> : null}
													{t.notFound ? <span className="text-destructive text-xs"> · not found</span> : null}
												</span>
												<Button size="xs" variant="ghost" aria-label={`Remove ${t.title}`} onClick={() => removeTrack.mutate({ id: p.id, index: i })}>
													Remove
												</Button>
											</li>
										))}
										{!p.tracks.length ? <li className="text-muted-foreground text-sm">Empty.</li> : null}
									</ol>
								) : null}
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
		</>
	);
}
