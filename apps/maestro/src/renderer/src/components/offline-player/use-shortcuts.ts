import { useEffect, useRef } from "react";
import { type ShortcutAction, shortcutAction } from "./shortcuts";

/** Keyboard keys on the Downloads page (see shortcuts.ts). */
export function useShortcuts(run: (a: ShortcutAction) => void) {
	const runRef = useRef(run);
	runRef.current = run;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
			const action = shortcutAction({ key: e.key, shiftKey: e.shiftKey, target: e.target as HTMLElement | null });
			if (!action) return;
			// Space on a focused button would also click it.
			e.preventDefault();
			runRef.current(action);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
}
