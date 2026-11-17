import type { NavigationHistory } from "electron";

export type NavigationState = { canGoBack: boolean; canGoForward: boolean; index: number };

/** What the toolbar's Back and Forward buttons need from the YTM view's history. */
export function navigationState(history: Pick<NavigationHistory, "canGoBack" | "canGoForward" | "getActiveIndex">): NavigationState {
	return { canGoBack: history.canGoBack(), canGoForward: history.canGoForward(), index: history.getActiveIndex() };
}
