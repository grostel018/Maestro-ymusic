// Offline downloads, page side (spec 2026-11-17 §5): a download button in the player bar, "Download" in a song's ⋮
// menu, "Download all" on playlist and album pages, and a Downloads entry in the sidebar. Downloads run in the main
// process (`downloads:add`); its state comes back as `downloads:status` / `downloads:all`.
import { hdArt } from "@shared/track/thumbnail";
import { jobFromRow, jobsFromPage, type PageDownloadJob } from "./downloads.logic";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

const BAR_ID = "ytmd-dl-bar";
const MENU_ID = "ytmd-dl-menu-item";
const ALL_ID = "ytmd-dl-all";
const GUIDE_ID = "ytmd-dl-guide";
const STYLE_ID = "ytmd-dl-style";

const ICON_DOWNLOAD = "M5 20h14v-2H5v2zm7-18v10.17l-3.59-3.58L7 10l5 5 5-5-1.41-1.41L13 12.17V2h-2z";
const ICON_DONE = "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z";

type Status = { videoId: string; state: "queued" | "binaries" | "downloading" | "done" | "error"; percent: number; error?: string };
type Player = { getPlayerResponse?: () => { videoDetails?: { videoId?: string; title?: string; author?: string; lengthSeconds?: string; thumbnail?: { thumbnails?: { url: string }[] } } } };

const ROW_SELECTOR = "ytmusic-playlist-shelf-renderer ytmusic-responsive-list-item-renderer, ytmusic-shelf-renderer ytmusic-responsive-list-item-renderer";
const CHECK_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='white' d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.2-4.2-4.2 1.4-1.4 2.8 2.8 6.3-6.3 1.4 1.4-7.7 7.7z'/></svg>";

const CSS = `
/* Songs already downloaded get a small check, like streaming apps; songs on their way get a faint pulse. */
[data-ytmd-dl] .fixed-columns::before { content: ""; display: inline-block; width: 16px; height: 16px; margin-right: 12px; vertical-align: middle; background: var(--ytmusic-text-secondary, #aaa); -webkit-mask: url("${CHECK_SVG}") center / contain no-repeat; }
[data-ytmd-dl="done"] .fixed-columns::before { background: var(--ytmusic-text-primary, #fff); }
[data-ytmd-dl="busy"] .fixed-columns::before { opacity: .5; }
@media (prefers-reduced-motion: no-preference) { [data-ytmd-dl="busy"] .fixed-columns::before { animation: ytmd-dl-pulse 1.2s ease-in-out infinite; } }
@keyframes ytmd-dl-pulse { 50% { opacity: .15; } }
#${BAR_ID} { position: relative; width: 40px; height: 40px; border: 0; background: none; color: var(--ytmusic-text-secondary, #aaa); cursor: pointer; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
#${BAR_ID}:hover { color: var(--ytmusic-text-primary, #fff); }
#${BAR_ID} svg { width: 22px; height: 22px; fill: currentColor; }
#${BAR_ID}[data-state="done"] { color: var(--ytmusic-text-primary, #fff); }
#${BAR_ID} .ring { position: absolute; inset: 6px; border-radius: 50%; background: conic-gradient(currentColor calc(var(--p, 0) * 1%), transparent 0); mask: radial-gradient(circle, transparent 60%, #000 61%); opacity: .8; pointer-events: none; }
#${MENU_ID} { display: flex; align-items: center; gap: 16px; padding: 0 16px; height: 48px; cursor: pointer; font: 400 14px Roboto, sans-serif; color: var(--ytmusic-text-primary, #fff); }
#${MENU_ID}:hover { background: rgba(255,255,255,.1); }
#${MENU_ID} svg { width: 24px; height: 24px; fill: currentColor; }
#${ALL_ID} { flex: none; align-self: center; margin-left: 8px; height: 40px; padding: 0 18px 0 14px; border-radius: 20px; border: 0; background: rgba(255,255,255,.1); color: var(--ytmusic-text-primary, #fff); font: 500 14px "YouTube Sans", Roboto, sans-serif; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
#${ALL_ID}:hover { background: rgba(255,255,255,.2); }
#${ALL_ID}:disabled { opacity: .6; cursor: default; }
#${ALL_ID} svg, #${GUIDE_ID} svg { width: 20px; height: 20px; fill: currentColor; }
#${GUIDE_ID} { display: flex; align-items: center; gap: 24px; margin: 0 8px; padding: 0 16px; height: 48px; border-radius: 8px; cursor: pointer; color: var(--ytmusic-text-primary, #fff); font: 500 14px Roboto, sans-serif; background: none; border: 0; width: calc(100% - 16px); text-align: left; }
#${GUIDE_ID}:hover { background: rgba(255,255,255,.1); }
`;

function svg(d: string): SVGSVGElement {
	const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	el.setAttribute("viewBox", "0 0 24 24");
	el.setAttribute("aria-hidden", "true");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", d);
	el.appendChild(path);
	return el;
}

function currentJob(): PageDownloadJob | null {
	const details = (getPagePlayerApi() as Player | null)?.getPlayerResponse?.()?.videoDetails;
	const videoId = details?.videoId;
	if (!videoId || !details?.title) return null;
	const thumbs = details.thumbnail?.thumbnails ?? [];
	const art = thumbs.at(-1)?.url;
	return {
		videoId,
		title: details.title,
		artist: (details.author ?? "").replace(/\s*-\s*Topic$/i, ""),
		durationSec: Number(details.lengthSeconds) || undefined,
		artUrl: art ? hdArt(art) : undefined,
	};
}

/** The album (`/browse/MPRE…`) or playlist (`/playlist?list=…` → `VL…`) id of the open page. */
function pageBrowseId(): string {
	const browse = /^\/browse\/([A-Za-z0-9_-]+)/.exec(location.pathname)?.[1];
	if (browse) return browse;
	const list = new URLSearchParams(location.search).get("list");
	return list ? `VL${list}` : "";
}

/** Polymer elements carry their renderer JSON on `.data`. */
const dataOf = (el: Element | null): unknown => (el as (Element & { data?: unknown }) | null)?.data ?? null;

const downloadsRenderer: RendererPluginRegistration = {
	id: "downloads",
	enabled: true,
	start(ctx) {
		const downloaded = new Set<string>();
		const statuses = new Map<string, Status>();
		/** The row whose ⋮ menu was opened last. */
		let menuRow: unknown = null;

		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = CSS;
		document.head.appendChild(style);

		const add = (jobs: PageDownloadJob[]) => {
			if (jobs.length) ctx.ytmd?.emit("downloads:add", jobs);
		};
		const openPage = () => ctx.ytmd?.emit("downloads:open");

		const renderBar = () => {
			const btn = document.getElementById(BAR_ID);
			if (!btn) return;
			const job = currentJob();
			const id = job?.videoId ?? "";
			const status = statuses.get(id);
			const state = downloaded.has(id) ? "done" : status && status.state !== "done" ? status.state : "idle";
			if (btn.dataset.state === state && btn.dataset.id === id && state !== "downloading") return;
			btn.dataset.state = state;
			btn.dataset.id = id;
			btn.replaceChildren(svg(state === "done" ? ICON_DONE : ICON_DOWNLOAD));
			if (state === "downloading" || state === "queued" || state === "binaries") {
				const ring = document.createElement("span");
				ring.className = "ring";
				ring.style.setProperty("--p", String(status?.percent ?? 0));
				btn.appendChild(ring);
			}
			const label =
				state === "done"
					? "Downloaded: open Downloads"
					: state === "error"
						? `Download failed (${status?.error ?? "error"}): try again`
						: state === "idle"
							? "Download this song"
							: `Downloading${status?.percent ? ` ${status.percent}%` : "…"}`;
			btn.title = label;
			btn.setAttribute("aria-label", label);
		};

		/** Marks downloaded and downloading songs in YouTube Music's own lists. */
		const markRows = () => {
			for (const row of document.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
				const id = jobFromRow(dataOf(row))?.videoId;
				const status = id ? statuses.get(id) : undefined;
				const state = id && downloaded.has(id) ? "done" : status && (status.state === "queued" || status.state === "binaries" || status.state === "downloading") ? "busy" : "";
				if ((row.dataset.ytmdDl ?? "") === state) continue;
				if (state) row.dataset.ytmdDl = state;
				else delete row.dataset.ytmdDl;
			}
		};

		const mount = () => {
			if (!document.getElementById(BAR_ID)) {
				const likes = document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer");
				const controls =
					document.querySelector("ytmusic-player-bar .right-controls-buttons") ??
					(likes?.closest("ytmusic-player-bar .middle-controls") ? null : likes?.parentElement) ??
					document.querySelector("ytmusic-player-bar #right-controls");
				if (controls) {
					const btn = document.createElement("button");
					btn.id = BAR_ID;
					btn.type = "button";
					btn.addEventListener("click", (e) => {
						e.stopPropagation();
						const job = currentJob();
						if (!job) return;
						if (downloaded.has(job.videoId)) openPage();
						else add([job]);
					});
					controls.prepend(btn);
				}
			}
			renderBar();
			markRows();

			// "Download all" on playlist and album pages.
			const onList = /^\/(playlist|browse\/MPRE)/.test(location.pathname);
			const existingAll = document.getElementById(ALL_ID);
			if (!onList) existingAll?.remove();
			else if (!existingAll) {
				const actions = document.querySelector("ytmusic-responsive-header-renderer .action-buttons, ytmusic-detail-header-renderer .action-buttons, ytmusic-responsive-header-renderer #action-buttons");
				if (actions) {
					const btn = document.createElement("button");
					btn.id = ALL_ID;
					btn.type = "button";
					btn.append(svg(ICON_DOWNLOAD), document.createTextNode("Download all"));
					btn.title = "Download every song on this page (songs further down load as you scroll)";
					btn.addEventListener("click", () => {
						const rows = [...document.querySelectorAll(ROW_SELECTOR)].map(dataOf);
						// Album rows have no artist or cover of their own: the page header gives them.
						const header = dataOf(document.querySelector("ytmusic-responsive-header-renderer"));
						const jobs = jobsFromPage(header, rows, pageBrowseId()).filter((j) => !downloaded.has(j.videoId));
						add(jobs);
						btn.lastChild!.textContent = jobs.length ? `Downloading ${jobs.length}` : "All downloaded";
						btn.disabled = true;
						window.setTimeout(() => {
							btn.lastChild!.textContent = "Download all";
							btn.disabled = false;
						}, 3000);
					});
					actions.appendChild(btn);
				}
			}

			// A Downloads entry under the sidebar's first section (Home, Explore, Library).
			if (!document.getElementById(GUIDE_ID)) {
				const items = document.querySelector("ytmusic-guide-renderer ytmusic-guide-section-renderer #items");
				if (items) {
					const entry = document.createElement("button");
					entry.id = GUIDE_ID;
					entry.type = "button";
					entry.append(svg(ICON_DOWNLOAD), document.createTextNode("Downloads"));
					entry.addEventListener("click", openPage);
					items.appendChild(entry);
				}
			}
		};

		// Remember which row's ⋮ was clicked, then add "Download" to the menu that opens.
		const onClick = (e: MouseEvent) => {
			const target = e.target as Element | null;
			if (!target?.closest?.("ytmusic-menu-renderer, #button-shape, yt-button-shape, tp-yt-paper-icon-button")) return;
			const row = target.closest("ytmusic-responsive-list-item-renderer, ytmusic-player-queue-item, ytmusic-two-row-item-renderer");
			menuRow = row ? dataOf(row) : null;
		};
		document.addEventListener("click", onClick, true);
		const contextMenu = (e: MouseEvent) => {
			const row = (e.target as Element | null)?.closest?.("ytmusic-responsive-list-item-renderer, ytmusic-player-queue-item");
			if (row) menuRow = dataOf(row);
		};
		document.addEventListener("contextmenu", contextMenu, true);

		const addMenuItem = () => {
			const popup = document.querySelector("ytmusic-menu-popup-renderer");
			const list = popup?.querySelector("#items, tp-yt-paper-listbox");
			if (!popup || !list || (popup as HTMLElement).offsetParent === null) return;
			const job = jobFromRow(menuRow);
			const existing = document.getElementById(MENU_ID);
			if (!job) {
				existing?.remove();
				return;
			}
			if (existing?.dataset.id === job.videoId && existing.parentElement === list) return;
			existing?.remove();
			const item = document.createElement("div");
			item.id = MENU_ID;
			item.dataset.id = job.videoId;
			item.setAttribute("role", "menuitem");
			item.tabIndex = 0;
			const done = downloaded.has(job.videoId);
			item.append(svg(done ? ICON_DONE : ICON_DOWNLOAD), document.createTextNode(done ? "Downloaded" : "Download"));
			const choose = () => {
				if (done) openPage();
				else add([job]);
				// Close YTM's menu the way it closes itself.
				document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			};
			item.addEventListener("click", choose);
			item.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") choose();
			});
			list.prepend(item);
		};
		const popupHost = document.querySelector("ytmusic-popup-container") ?? document.body;
		const observer = new MutationObserver(() => addMenuItem());
		observer.observe(popupHost, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "aria-hidden"] });

		const offStatus =
			ctx.ytmd?.on("downloads:status", (s) => {
				const status = s as Status;
				if (!status?.videoId) return;
				statuses.set(status.videoId, status);
				if (status.state === "done") downloaded.add(status.videoId);
				renderBar();
				markRows();
			}) ?? (() => undefined);
		const offAll =
			ctx.ytmd?.on("downloads:all", (payload) => {
				const p = payload as { statuses?: Status[]; downloaded?: string[] };
				downloaded.clear();
				for (const id of p.downloaded ?? []) downloaded.add(id);
				statuses.clear();
				for (const s of p.statuses ?? []) statuses.set(s.videoId, s);
				renderBar();
				markRows();
			}) ?? (() => undefined);
		ctx.ytmd?.emit("downloads:status-request");

		mount();
		// YTM re-stamps the player bar and pages now and then, dropping our nodes; put them back.
		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);

		return () => {
			window.clearInterval(remount);
			observer.disconnect();
			document.removeEventListener("click", onClick, true);
			document.removeEventListener("contextmenu", contextMenu, true);
			offStatus();
			offAll();
			for (const id of [BAR_ID, MENU_ID, ALL_ID, GUIDE_ID, STYLE_ID]) document.getElementById(id)?.remove();
			for (const row of document.querySelectorAll<HTMLElement>("[data-ytmd-dl]")) delete row.dataset.ytmdDl;
		};
	},
};

export default downloadsRenderer;
