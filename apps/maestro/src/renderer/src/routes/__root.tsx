import { isLightLook, normalizeLook } from "@shared/theme/look";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppToast } from "@/hooks/use-app-toast";
import { useSettingsState } from "@/hooks/use-settings";
import { queryClient, trpc, trpcClient } from "@/lib/trpc";

export const Route = createRootRoute({
	component: RootLayout,
});

function AppToastBridge() {
	useAppToast();
	return null;
}

/** The app's windows follow the palette: a light one turns off the `dark` class. */
function ThemedShell() {
	const [lookRaw] = useSettingsState<unknown>("themes.look", null);
	const theme = isLightLook(normalizeLook(lookRaw)) ? "light" : "dark";
	return (
		<ThemeProvider attribute="class" defaultTheme="dark" forcedTheme={theme} enableSystem={false}>
			<TooltipProvider delay={0}>
				<AppToastBridge />
				<Outlet />
				<Toaster theme={theme} />
			</TooltipProvider>
		</ThemeProvider>
	);
}

function RootLayout() {
	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<ThemedShell />
			</QueryClientProvider>
		</trpc.Provider>
	);
}
