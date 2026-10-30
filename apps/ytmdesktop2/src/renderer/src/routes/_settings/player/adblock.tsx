import { createFileRoute } from "@tanstack/react-router";
import { ResetDefaults } from "@/components/reset-defaults";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/player/adblock")({
	component: AdblockSettingsPage,
});

function RestartBadge() {
	return <Badge variant="outline">Restart required</Badge>;
}

function AdblockSettingsPage() {
	const stats = trpc.adblock.stats.useQuery(undefined, { refetchInterval: 5_000 });

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Ad block</CardTitle>
					<CardDescription>Keep ads out of playback.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="adblock.enabled"
							defaultValue={true}
							description="Turning this off stops blocking at once; removing ads from YouTube responses stops after a restart."
						>
							Block ads
						</SettingsCheckbox>
						<p className="text-muted-foreground text-sm" data-testid="adblock-stats">
							Blocked this session: {stats.data?.session ?? 0} · All time: {stats.data?.total ?? 0}
						</p>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Advanced</CardTitle>
					<CardDescription>Turn individual ad-blocking layers on or off.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="adblock.network" defaultValue={true}>
							Block ad servers
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="adblock.prune"
							defaultValue={true}
							description={<RestartBadge />}
						>
							Remove ads from YouTube responses
						</SettingsCheckbox>
						<SettingsCheckbox configKey="adblock.fallback" defaultValue={true}>
							Skip ads that slip through
						</SettingsCheckbox>
						<SettingsCheckbox configKey="adblock.hideUpsells" defaultValue={true}>
							Hide Premium pop-ups
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
			<ResetDefaults keys={["adblock.enabled", "adblock.network", "adblock.prune", "adblock.fallback", "adblock.hideUpsells"]} />
		</>
	);
}
