import { createFileRoute } from "@tanstack/react-router";
import { ResetDefaults } from "@/components/reset-defaults";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/")({
	component: GenericSettingsPage,
});

function GenericSettingsPage() {
	const [getStartedEnabled, setGetStartedEnabled, { isPending: getStartedPending }] = useSettingsState("app.getstarted", false);
	const [appAutostartEnabled, , { isPending: autostartPending }] = useSettingsState("app.autostart", false);

	return (
		<>
			{getStartedEnabled && (
				<Card>
					<CardHeader>
						<CardTitle>Get Started</CardTitle>
						<CardDescription>
							Welcome to Maestro. Adjust settings and personalize your experience.
						</CardDescription>
					</CardHeader>
					<CardFooter className="justify-between gap-2">
						<a href="https://youtube-music.app/" target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
							Learn more
						</a>
						<Button variant="ghost" size="sm" disabled={getStartedPending} onClick={() => setGetStartedEnabled(false)}>
							Don't show again
						</Button>
					</CardFooter>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Application</CardTitle>
					<CardDescription>Startup and system behavior.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.autostart" description={appAutostartEnabled ? "Launch YouTube Music when you sign in." : undefined}>
							Enable Autostart
						</SettingsCheckbox>
						{appAutostartEnabled && !autostartPending && <SettingsCheckbox configKey="app.autostartMinimized">Start minimized</SettingsCheckbox>}
						<SettingsCheckbox configKey="app.minimizeTrayOverride" description="Close window to tray instead of quitting.">
							Minimize to tray on close
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="app.gameMode"
							defaultValue={true}
							description="While another app or a game is in front, the app runs at lower priority; minimized, caches are freed too. The music keeps its priority."
						>
							Game mode
						</SettingsCheckbox>
						<SettingsCheckbox configKey="app.disableHardwareAccel" description="Requires an app restart to apply.">
							Disable Hardware Acceleration
						</SettingsCheckbox>
						<SettingsCheckbox configKey="app.forceGpu" description="Use the GPU even if Chromium blocklists your driver. Requires an app restart to apply.">
							Force GPU acceleration
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Updater</CardTitle>
					<CardDescription>Automatic update checks and installs.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.autoupdate">Enable Autoupdate</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sentry / Error reporting</CardTitle>
					<CardDescription>Help improve the app by sharing anonymized crash data.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="app.enableStatisticsAndErrorTracing"
							description="Allows faster bug fixing via anonymized error reports."
						>
							Allow anonymized error reporting
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Developer
						<Badge variant="destructive">Caution</Badge>
					</CardTitle>
					<CardDescription>Advanced tools for debugging. Do not paste unknown scripts into the console.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.enableDev" description="Enables developer tools for testing additional functionality.">
							Enable Developer Mode
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
			<ResetDefaults keys={["app"]} label="Restore Generic defaults" />
			<ResetDefaults all />
		</>
	);
}
