import type { FactCard } from "@shared/facts/cards";
import { currentAlbum } from "./player-bar";
import { setIcon } from "./video-controls.menu";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";

// About panel (roadmap F3): song and artist facts from Wikipedia, MusicBrainz, Last.fm and Genius, in a side panel
// opened from the player bar's info button. Fetched by main (main/trpc/routers/facts/service.ts) only while the
// panel is open, and again when the track changes with it open.

const BUTTON_ID = "ytmd-facts-button";
const PANEL_ID = "ytmd-facts";
const STYLE_ID = "ytmd-facts-style";
// Material "info".
const INFO = "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z";

const CSS = `
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
	border-radius: 50%; color: rgba(255, 255, 255, 0.7); }
#${BUTTON_ID}:hover, #${BUTTON_ID}[aria-pressed="true"] { color: #fff; background: rgba(255, 255, 255, 0.08); }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BUTTON_ID} svg { width: 20px; height: 20px; fill: currentColor; }
#${PANEL_ID} { position: fixed; top: 72px; right: 16px; bottom: 88px; width: min(380px, 40vw); z-index: 2147481000; display: flex; flex-direction: column;
	border-radius: 14px; background: color-mix(in srgb, var(--ytmd-surface, #212121) 92%, transparent); color: var(--ytmd-text, #fff);
	box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 400 14px/1.45 "YouTube Sans", Roboto, sans-serif; overflow: hidden; }
#${PANEL_ID} header { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
#${PANEL_ID} header h2 { flex: 1; margin: 0; font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${PANEL_ID} header button { all: unset; cursor: pointer; padding: 4px 8px; border-radius: 8px; color: var(--ytmd-subtext, #aaa); }
#${PANEL_ID} header button:hover { color: #fff; background: rgba(255,255,255,.08); }
#${PANEL_ID} .list { flex: 1; overflow-y: auto; padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
#${PANEL_ID} .card { padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,.05); }
#${PANEL_ID} .card .src { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--ytmd-subtext, #aaa); }
#${PANEL_ID} .card h3 { margin: 2px 0 6px; font-size: 14px; font-weight: 600; }
#${PANEL_ID} .card p { margin: 0; color: color-mix(in srgb, var(--ytmd-text, #fff) 85%, transparent); }
#${PANEL_ID} .card a { display: inline-block; margin-top: 6px; color: var(--ytmd-accent, #3ea6ff); font-size: 12px; text-decoration: none; }
#${PANEL_ID} .empty { padding: 8px 0; color: var(--ytmd-subtext, #aaa); }
`;

type Track = { videoId: string; title: string; artist: string; album?: string };

function readTrack(): Track | null {
	const data = getPagePlayerApi()?.getVideoData?.() as { video_id?: string; title?: string; author?: string } | undefined;
	if (!data?.video_id || !data.title) return null;
	return { videoId: data.video_id, title: data.title, artist: data.author ?? "", album: currentAlbum(data.video_id)?.title };
}

const factsRenderer: RendererPluginRegistration = {
	id: "facts",
	enabled: true,
	start(ctx) {
		let shownFor = "";

		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			(document.head ?? document.documentElement).appendChild(style);
		}

		const panel = () => document.getElementById(PANEL_ID);

		const render = (track: Track, cards: FactCard[] | null) => {
			const p = panel();
			if (!p) return;
			const title = p.querySelector("h2");
			if (title) title.textContent = `${track.title}${track.artist ? ` · ${track.artist}` : ""}`;
			const list = p.querySelector(".list");
			if (!list) return;
			list.replaceChildren();
			if (!cards) {
				const loading = document.createElement("div");
				loading.className = "empty";
				loading.textContent = "Looking it up…";
				list.appendChild(loading);
				return;
			}
			if (!cards.length) {
				const none = document.createElement("div");
				none.className = "empty";
				none.textContent = "Nothing found for this song.";
				list.appendChild(none);
				return;
			}
			for (const c of cards) {
				const card = document.createElement("div");
				card.className = "card";
				const src = document.createElement("div");
				src.className = "src";
				src.textContent = c.source;
				const h = document.createElement("h3");
				h.textContent = c.title;
				const text = document.createElement("p");
				text.textContent = c.text;
				card.append(src, h, text);
				if (c.url?.startsWith("https://")) {
					const a = document.createElement("a");
					a.href = c.url;
					a.textContent = `More on ${c.source}`;
					a.addEventListener("click", (e) => {
						e.preventDefault();
						ctx.ytmd?.emit("facts:open", c.url);
					});
					card.appendChild(a);
				}
				list.appendChild(card);
			}
		};

		const request = () => {
			const track = readTrack();
			if (!track || !panel()) return;
			if (track.videoId === shownFor) return;
			shownFor = track.videoId;
			render(track, null);
			ctx.ytmd?.emit("facts:request", track);
		};

		const close = () => {
			panel()?.remove();
			shownFor = "";
			document.getElementById(BUTTON_ID)?.setAttribute("aria-pressed", "false");
		};

		const open = () => {
			if (panel()) return;
			const p = document.createElement("aside");
			p.id = PANEL_ID;
			p.setAttribute("aria-label", "About this song");
			const header = document.createElement("header");
			const h = document.createElement("h2");
			const x = document.createElement("button");
			x.type = "button";
			x.textContent = "Close";
			x.addEventListener("click", close);
			header.append(h, x);
			const list = document.createElement("div");
			list.className = "list";
			p.append(header, list);
			document.body.appendChild(p);
			document.getElementById(BUTTON_ID)?.setAttribute("aria-pressed", "true");
			request();
		};

		const offResult =
			ctx.ytmd?.on("facts:result", (payload) => {
				const r = payload as { videoId?: string; cards?: FactCard[] } | null;
				const track = readTrack();
				if (!r || !track || r.videoId !== track.videoId || r.videoId !== shownFor) return;
				render(track, Array.isArray(r.cards) ? r.cards : []);
			}) ?? (() => undefined);

		// A new track while the panel is open: look it up too.
		const onLoaded = () => {
			if (panel()) request();
		};
		document.addEventListener("loadeddata", onLoaded, true);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && panel()) close();
		};
		window.addEventListener("keydown", onKey);

		const mount = () => {
			if (document.getElementById(BUTTON_ID)) return;
			const anchor =
				document.getElementById("ytmd-sing-button") ?? document.getElementById("ytmd-sleep-button") ?? document.getElementById("ytmd-av-bar-button");
			if (!anchor?.parentElement) return;
			const btn = document.createElement("button");
			btn.id = BUTTON_ID;
			btn.type = "button";
			btn.title = "About this song";
			btn.setAttribute("aria-label", btn.title);
			btn.setAttribute("aria-pressed", "false");
			setIcon(btn, INFO);
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				if (panel()) close();
				else open();
			});
			anchor.insertAdjacentElement("afterend", btn);
		};
		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);
		mount();

		return () => {
			offResult();
			window.clearInterval(remount);
			document.removeEventListener("loadeddata", onLoaded, true);
			window.removeEventListener("keydown", onKey);
			close();
			document.getElementById(BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default factsRenderer;
