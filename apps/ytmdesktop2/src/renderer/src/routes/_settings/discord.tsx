import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

export const Route = createFileRoute("/_settings/discord")({
	component: DiscordSettingsPage,
});

function DiscordSettingsPage() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Discord</CardTitle>
				<CardDescription>Show friends on Discord what you are listening to. Needs the Discord app running on this computer.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<SettingsCheckbox configKey="discord.enabled">Show what I'm listening to</SettingsCheckbox>
					<SettingsCheckbox configKey="discord.buttons" description="Adds a Listen button to your Discord status.">Show buttons</SettingsCheckbox>
				</FieldGroup>
			</CardContent>
			<CardFooter>
				<a href="https://discord.com/rich-presence" target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
					Learn more about Rich Presence
				</a>
			</CardFooter>
		</Card>
	);
}
