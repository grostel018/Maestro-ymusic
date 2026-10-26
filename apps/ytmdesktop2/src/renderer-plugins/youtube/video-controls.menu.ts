// Small popup menus for the video controls and the player-bar speed button (roadmap C2, C4). Built with DOM calls:
// YouTube enforces Trusted Types, which blocks innerHTML strings.

export type MenuItem =
	| { label: string; checked?: boolean; onSelect: () => void }
	| { label: string; element: HTMLElement };

const MENU_ID = "ytmd-vc-menu";
const SVG_NS = "http://www.w3.org/2000/svg";

let closeCurrent: (() => void) | null = null;

export function isMenuOpen(): boolean {
	return !!document.getElementById(MENU_ID);
}

export function closeMenu(): void {
	closeCurrent?.();
}

/** Opens `items` above `anchor` (or below when there's no room). Clicking an item or outside closes it. */
export function openMenu(anchor: HTMLElement, title: string, items: MenuItem[]): void {
	closeMenu();
	const menu = document.createElement("div");
	menu.id = MENU_ID;
	menu.setAttribute("role", "menu");
	menu.setAttribute("aria-label", title);
	const heading = document.createElement("div");
	heading.className = "ytmd-vc-menu-title";
	heading.textContent = title;
	menu.appendChild(heading);
	for (const item of items) {
		if ("element" in item) {
			const row = document.createElement("div");
			row.className = "ytmd-vc-menu-row";
			const label = document.createElement("span");
			label.textContent = item.label;
			row.append(label, item.element);
			menu.appendChild(row);
			continue;
		}
		const btn = document.createElement("button");
		btn.type = "button";
		btn.setAttribute("role", "menuitemradio");
		btn.setAttribute("aria-checked", String(!!item.checked));
		btn.textContent = item.label;
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			close();
			item.onSelect();
		});
		menu.appendChild(btn);
	}
	// Fullscreen shows only the fullscreen element's subtree, so the menu goes there.
	(document.fullscreenElement ?? document.body).appendChild(menu);
	const a = anchor.getBoundingClientRect();
	const m = menu.getBoundingClientRect();
	const left = Math.max(8, Math.min(window.innerWidth - m.width - 8, a.right - m.width));
	const top = a.top - m.height - 8 >= 8 ? a.top - m.height - 8 : a.bottom + 8;
	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
	menu.querySelector<HTMLElement>("button[aria-checked='true'], button")?.focus({ preventScroll: true });

	const onDown = (e: PointerEvent) => {
		if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		e.stopPropagation();
		close();
	};
	function close() {
		menu.remove();
		document.removeEventListener("pointerdown", onDown, true);
		document.removeEventListener("keydown", onKey, true);
		if (closeCurrent === close) closeCurrent = null;
	}
	document.addEventListener("pointerdown", onDown, true);
	document.addEventListener("keydown", onKey, true);
	closeCurrent = close;
}

export function setIcon(button: HTMLElement, d: string): void {
	let path = button.querySelector("path");
	if (!path) {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		path = document.createElementNS(SVG_NS, "path");
		svg.appendChild(path);
		button.appendChild(svg);
	}
	path.setAttribute("d", d);
}

export const MENU_CSS = `
#${MENU_ID} { position: fixed; z-index: 2147483000; min-width: 180px; max-height: 60vh; overflow-y: auto; padding: 6px 0;
	border-radius: 12px; background: rgba(28, 28, 28, 0.96); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
	font: 400 13px/1.2 "YouTube Sans", Roboto, sans-serif; color: #fff; }
#${MENU_ID} .ytmd-vc-menu-title { padding: 6px 16px 8px; font-weight: 500; color: rgba(255, 255, 255, 0.6); }
#${MENU_ID} button { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px 16px 8px 36px; cursor: pointer; position: relative; }
#${MENU_ID} button:hover, #${MENU_ID} button:focus-visible { background: rgba(255, 255, 255, 0.1); }
#${MENU_ID} button[aria-checked="true"]::before { content: "✓"; position: absolute; left: 14px; }
#${MENU_ID} .ytmd-vc-menu-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; }
#${MENU_ID} input[type="range"] { width: 120px; accent-color: #fff; }
`;
