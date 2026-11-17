// In-page keys of the offline player. Next and previous stay on the global shortcuts (Shift+Alt+→/←), which reach the
// offline player through main's active-player routing. Lowercase k is play/pause (DECISIONS 2026-10-30).

export type ShortcutAction = "toggle" | "seek+5" | "seek-5" | "speed+" | "speed-" | "mute";

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function shortcutAction(e: { key: string; shiftKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): ShortcutAction | null {
	const tag = e.target?.tagName?.toUpperCase() ?? "";
	if (TYPING.has(tag) || e.target?.isContentEditable) return null;
	switch (e.key) {
		case " ":
		case "k":
			return "toggle";
		case "ArrowRight":
			return "seek+5";
		case "ArrowLeft":
			return "seek-5";
		case ">":
			return "speed+";
		case "<":
			return "speed-";
		case "m":
			return "mute";
		default:
			return null;
	}
}
