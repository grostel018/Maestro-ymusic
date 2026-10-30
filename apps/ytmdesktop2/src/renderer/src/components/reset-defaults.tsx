import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * "Restore defaults" for a settings tab (`keys`), or for every setting (`all`). Asks first; sign-ins are never reset.
 */
export function ResetDefaults({ keys, all = false, label }: { keys?: string[]; all?: boolean; label?: string }) {
	const utils = trpc.useUtils();
	const reset = trpc.settings.resetDefaults.useMutation({ onSuccess: () => void utils.settings.invalidate() });
	const text = label ?? (all ? "Restore all settings to defaults" : "Restore this page's defaults");
	return (
		<div className="flex justify-end">
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={reset.isLoading}
				onClick={() => {
					const question = all
						? "Put every setting back to its default? Your sign-ins (Google, Last.fm) are kept."
						: "Put the settings on this page back to their defaults?";
					if (window.confirm(question)) reset.mutate({ keys: all ? undefined : keys });
				}}
			>
				{reset.isLoading ? "Restoring…" : text}
			</Button>
		</div>
	);
}
