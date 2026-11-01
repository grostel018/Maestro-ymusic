import { collectIds } from "@shared/playlists/parse";
import { trackControls } from "./api-controls.cmds";
import { closeMenu, type MenuItem, openMenu, setIcon } from "./video-controls.menu";
import { parseSearch, pickMatch } from "./video-mode.match";
import { SEARCH_PARAMS } from "./video-mode.search";
import { getPagePlayerApi } from "./world0/context";
import type { RendererPluginRegistration } from "./world0/types";
import { dispatchQueueAddItems, resolveYtmApp, resolveYtmStore } from "./ytm-store";

// The page side of local playlists and smart shuffle (roadmap G7, G4; main/trpc/routers/playlists/service.ts): whatever
// needs YouTube's signed-in session, plus the player-bar button that adds the playing song to a playlist.

const BUTTON_ID = "ytmd-playlist-button";
const STYLE_ID = "ytmd-playlist-style";
const PLAYLIST_ADD = "M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z";
const QUEUE_BATCH = 50;
const PLAY_WAIT_MS = 15_000;

const CSS = `
#${BUTTON_ID} { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
	border-radius: 50%; color: color-mix(in srgb, var(--ytmd-text, #fff) 70%, transparent); }
#${BUTTON_ID}:hover { color: var(--ytmd-text, #fff); background: color-mix(in srgb, var(--ytmd-text, #fff) 8%, transparent); }
#${BUTTON_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#${BUTTON_ID} svg { width: 22px; height: 22px; fill: currentColor; }
@media (max-width: 900px) { #${BUTTON_ID} { display: none; } }
`;

type Network = NonNullable<NonNullable<ReturnType<typeof resolveYtmApp>>["networkManager"]>;

function network(): Network {
	const manager = resolveYtmApp()?.networkManager;
	if (typeof manager?.fetch !== "function") throw new Error("YouTube Music isn't ready yet.");
	return manager;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts the first song, then queues the rest behind it in batches. */
async function playAll(videoIds: string[]): Promise<{ queued: number }> {
	const [first, ...rest] = videoIds;
	if (!first) throw new Error("Nothing to play.");
	trackControls.navigate({ videoId: first });
	const deadline = Date.now() + PLAY_WAIT_MS;
	const ready = () => {
		const queue = resolveYtmStore()?.getState?.()?.queue;
		const playing = (getPagePlayerApi()?.getVideoData?.() as { video_id?: string } | undefined)?.video_id;
		return playing === first && !!queue?.queueContextParams && !!queue.items?.length;
	};
	while (!ready()) {
		if (Date.now() > deadline) throw new Error("YouTube Music didn't start that song.");
		await sleep(150);
	}
	let queued = 0;
	for (let i = 0; i < rest.length; i += QUEUE_BATCH) {
		const store = resolveYtmStore();
		const queue = store?.getState?.()?.queue;
		if (!store || !queue?.queueContextParams) break;
		const result = await network().fetch("/music/get_queue", {
			queueContextParams: queue.queueContextParams,
			queueInsertPosition: "INSERT_AT_END",
			videoIds: rest.slice(i, i + QUEUE_BATCH),
		});
		const items = result?.queueDatas?.map((d) => d.content).filter(Boolean) ?? [];
		dispatchQueueAddItems(store, items, queue.items?.length ?? 0);
		queued += items.length;
	}
	return { queued };
}

/** A song for an imported line: with a known length the strict match, otherwise YouTube Music's best song result. */
async function search(data: { title: string; artist: string; durationSec: number }) {
	const query = `${data.title} ${data.artist}`.trim();
	const hits = parseSearch(await network().fetch("/search", { query, params: SEARCH_PARAMS.song }));
	const hit = (data.durationSec > 0 ? pickMatch(data, hits, "song") : null) ?? hits[0] ?? null;
	return hit ? { videoId: hit.videoId, title: hit.title, artist: hit.artist, durationSec: hit.durationSec } : null;
}

/** Your liked songs; a signed-out session has none, which is fine. */
async function liked(): Promise<string[]> {
	return [...new Set(collectIds(await network().fetch("/browse", { browseId: "VLLM" }), "musicResponsiveListItemRenderer"))];
}

async function radio(data: { videoId: string }): Promise<string[]> {
	const res = await network().fetch("/next", { videoId: data.videoId, playlistId: `RDAMVM${data.videoId}`, isAudioOnly: true });
	return [...new Set(collectIds(res, "playlistPanelVideoRenderer"))].filter((id) => id !== data.videoId);
}

async function run(kind: string, data: never): Promise<unknown> {
	switch (kind) {
		case "play":
			return await playAll((data as { videoIds: string[] }).videoIds);
		case "search":
			return await search(data);
		case "liked":
			return await liked();
		case "radio":
			return await radio(data);
		case "queue":
			return (await trackControls.queueList()).items;
		default:
			throw new Error(`unknown command ${kind}`);
	}
}

const playlistsRenderer: RendererPluginRegistration = {
	id: "playlists",
	enabled: true,
	start(ctx) {
		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			(document.head ?? document.documentElement).appendChild(style);
		}
		const offCmd =
			ctx.ytmd?.on("playlists:cmd", (payload) => {
				const { id, kind, data } = payload as { id: string; kind: string; data: never };
				run(kind, data).then(
					(result) => ctx.ytmd?.emit("playlists:reply", { id, ok: true, data: result }),
					(err: unknown) => ctx.ytmd?.emit("playlists:reply", { id, ok: false, error: err instanceof Error ? err.message : String(err) }),
				);
			}) ?? (() => undefined);

		let menuButton: HTMLElement | null = null;
		const offMenu =
			ctx.ytmd?.on("playlists:menu", (payload) => {
				if (!menuButton) return;
				const { playlists } = payload as { playlists: { id: string; name: string }[] };
				const items: MenuItem[] = [
					{ label: "Smart shuffle", onSelect: () => ctx.ytmd?.emit("playlists:action", { type: "smart" }) },
					...playlists.map((p) => ({ label: `Add to ${p.name}`, onSelect: () => ctx.ytmd?.emit("playlists:action", { type: "add", id: p.id }) })),
					{ label: "Add to a new playlist", onSelect: () => ctx.ytmd?.emit("playlists:action", { type: "add-new" }) },
				];
				openMenu(menuButton, "Playlists", items);
			}) ?? (() => undefined);

		/** Next to the Song/Video button (video-mode.renderer.ts finds the right spot in each player-bar layout). */
		const mount = () => {
			if (document.getElementById(BUTTON_ID)) return;
			const av = document.getElementById("ytmd-av-bar-button");
			if (!av?.parentElement) return;
			const btn = document.createElement("button");
			btn.id = BUTTON_ID;
			btn.type = "button";
			btn.title = "Playlists";
			btn.setAttribute("aria-label", "Playlists");
			setIcon(btn, PLAYLIST_ADD);
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				menuButton = btn;
				ctx.ytmd?.emit("playlists:menu-request");
			});
			av.insertAdjacentElement("afterend", btn);
		};
		const remount = window.setInterval(() => {
			if (!document.hidden) mount();
		}, 2000);
		mount();

		return () => {
			window.clearInterval(remount);
			offCmd();
			offMenu();
			closeMenu();
			document.getElementById(BUTTON_ID)?.remove();
			document.getElementById(STYLE_ID)?.remove();
		};
	},
};

export default playlistsRenderer;
