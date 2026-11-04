// One small status toast above the player bar, shared by the page-world plugins.
const TOAST_ID = "ytmd-page-toast";
const STYLE_ID = "ytmd-page-toast-style";

const CSS = `
#${TOAST_ID} { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 2147483000; padding: 10px 16px; border-radius: 8px;
	background: rgba(28, 28, 28, 0.96); color: #fff; font: 400 13px/1.3 "YouTube Sans", Roboto, sans-serif; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4); }
`;

export function pageToast(text: string, ms = 4000): void {
	if (!document.getElementById(STYLE_ID)) {
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = CSS;
		(document.head ?? document.documentElement).appendChild(style);
	}
	document.getElementById(TOAST_ID)?.remove();
	const el = document.createElement("div");
	el.id = TOAST_ID;
	el.setAttribute("role", "status");
	el.textContent = text;
	document.body.appendChild(el);
	window.setTimeout(() => el.remove(), ms);
}

export function removePageToast(): void {
	document.getElementById(TOAST_ID)?.remove();
}
