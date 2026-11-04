import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/player/stats")({
	component: StatsPage,
});

const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function StatsPage() {
	const summary = trpc.stats.summary.useQuery(undefined, { refetchInterval: 30_000 });
	const utils = trpc.useUtils();
	const reset = trpc.stats.reset.useMutation({ onSuccess: () => void utils.stats.summary.invalidate() });
	const s = summary.data;
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Your listening</CardTitle>
					<CardDescription>
						Counted on this computer only, from what you actually played{s ? ` since ${new Date(s.since).toLocaleDateString()}` : ""}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-8">
						<div>
							<div className="text-3xl font-semibold tabular-nums">{s?.yearHours ?? 0} h</div>
							<div className="text-muted-foreground text-xs">in {s?.year ?? new Date().getFullYear()}</div>
						</div>
						<div>
							<div className="text-3xl font-semibold tabular-nums">{s?.totalHours ?? 0} h</div>
							<div className="text-muted-foreground text-xs">in total</div>
						</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Top songs</CardTitle>
				</CardHeader>
				<CardContent>
					<ol className="flex flex-col gap-2">
						{(s?.topTracks ?? []).map((t, i) => (
							<li key={t.videoId} className="flex items-baseline gap-3 text-sm">
								<span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
								<span className="min-w-0 flex-1 truncate">
									<span className="font-medium">{t.title}</span>
									<span className="text-muted-foreground"> · {t.artist}</span>
								</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									{t.plays} plays · {minutes(t.minutes)}
								</span>
							</li>
						))}
						{s && !s.topTracks.length ? <li className="text-muted-foreground text-sm">Nothing yet: play some music.</li> : null}
					</ol>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Top artists</CardTitle>
				</CardHeader>
				<CardContent>
					<ol className="flex flex-col gap-2">
						{(s?.topArtists ?? []).map((a, i) => (
							<li key={a.artist} className="flex items-baseline gap-3 text-sm">
								<span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
								<span className="min-w-0 flex-1 truncate font-medium">{a.artist}</span>
								<span className="text-muted-foreground text-xs tabular-nums">{minutes(a.minutes)}</span>
							</li>
						))}
					</ol>
					<div className="mt-4 flex justify-end">
						<Button size="sm" variant="outline" disabled={reset.isLoading} onClick={() => reset.mutate()}>
							Reset stats
						</Button>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
