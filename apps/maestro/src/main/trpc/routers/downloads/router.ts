import { serverMain } from "@main/ipc/serverEvents";
import { fromIpcEvent } from "@main/trpc/fromIpcEvent";
import { provider } from "@main/trpc/provider";
import { trackService } from "@main/trpc/routers/track/service";
import type { OfflineCommand } from "@shared/track/offlineTrack";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";
import type { DownloadStatus } from "./service";

const videoId = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) });
const job = z.object({
	videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
	title: z.string().min(1).max(300),
	artist: z.string().max(300),
	album: z.string().max(300).optional(),
	artUrl: z.string().url().max(2000).optional(),
	durationSec: z.number().positive().optional(),
});

export const downloadsRouter = router({
	list: publicProcedure.query(({ ctx }) => provider(ctx, "downloads").list()),
	status: publicProcedure.query(({ ctx }) => provider(ctx, "downloads").status()),
	folder: publicProcedure.query(({ ctx }) => provider(ctx, "downloads").folder()),
	add: publicProcedure.input(z.object({ jobs: z.array(job).max(500) })).mutation(({ ctx, input }) => provider(ctx, "downloads").add(input.jobs)),
	cancel: publicProcedure.input(videoId).mutation(({ ctx, input }) => provider(ctx, "downloads").cancel(input.videoId)),
	retry: publicProcedure.input(z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional() })).mutation(({ ctx, input }) => provider(ctx, "downloads").retry(input.videoId)),
	dismiss: publicProcedure.input(z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional() })).mutation(({ ctx, input }) => provider(ctx, "downloads").dismiss(input.videoId)),
	remove: publicProcedure.input(videoId).mutation(({ ctx, input }) => provider(ctx, "downloads").remove(input.videoId)),
	showInFolder: publicProcedure.input(videoId).mutation(({ ctx, input }) => provider(ctx, "downloads").showInFolder(input.videoId)),
	openFolder: publicProcedure.mutation(({ ctx }) => provider(ctx, "downloads").openFolder()),
	chooseFolder: publicProcedure.input(z.object({ move: z.boolean() })).mutation(({ ctx, input }) => provider(ctx, "downloads").chooseFolder(input.move)),
	/** Shows the Downloads page in the main window, in YouTube Music's place. */
	openPage: publicProcedure.mutation(() => void serverMain.emit("downloads:open")),
	/** `retry`: load YouTube Music again (after being offline). */
	closePage: publicProcedure.input(z.object({ retry: z.boolean().optional() })).mutation(({ input }) => void serverMain.emit("downloads:close", { retry: !!input.retry })),
	getQueue: publicProcedure.query(({ ctx }) => provider(ctx, "downloads").getQueue()),
	saveQueue: publicProcedure
		.input(
			z.object({
				q: z.object({
					order: z.array(z.string().max(20)).max(5000),
					base: z.array(z.string().max(20)).max(5000),
					pos: z.number().int().min(0),
					repeat: z.enum(["off", "all", "one"]),
					shuffle: z.boolean(),
				}),
				positionSec: z.number().min(0),
			}),
		)
		.mutation(({ ctx, input }) => provider(ctx, "downloads").saveQueue(input)),
	/** Load YouTube Music again behind Downloads (Downloads stays, its song keeps playing). */
	retryOnline: publicProcedure.mutation(() => void serverMain.emit("downloads:retry")),
	/** Back to YouTube Music, keeping the offline player's queue and position (the page pauses first). */
	hidePage: publicProcedure.mutation(() => void serverMain.emit("downloads:hide")),
	/** The offline player's state, so main knows whether Downloads may close when YouTube Music comes back. */
	reportPlayer: publicProcedure
		.input(z.object({ hasQueue: z.boolean(), playing: z.boolean() }))
		.mutation(({ input }) => void serverMain.emit("downloads:player", input)),
	/** YouTube Music loaded again while Downloads stayed open. */
	onOnline: publicProcedure.subscription(() => fromIpcEvent<{ at: number }>("downloads:online")),
	/** The offline player's song and position: tray, Discord, Last.fm, the API and OBS follow it while it is active. */
	reportTrack: publicProcedure
		.input(
			z.object({
				videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
				title: z.string().max(300),
				artist: z.string().max(300),
				album: z.string().max(300).optional(),
				durationSec: z.number().nonnegative().optional(),
				playing: z.boolean(),
				position: z.number().nonnegative(),
				volume: z.number().min(0).max(100),
			}),
		)
		.mutation(({ input }) => {
			const { playing, position, volume, ...item } = input;
			// The track service is a module singleton (not in the service collection), like in the track router.
			return trackService.ingestOffline({ item, playing, position, volume });
		}),
	/** Seconds actually played offline, for Your stats (same shape the YouTube Music page sends). */
	reportListen: publicProcedure
		.input(z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: z.string().max(300), artist: z.string().max(300), seconds: z.number().int().min(0).max(3600) }))
		.mutation(({ input }) => void serverMain.emit("stats:listen", null, input)),
	/** Commands from tray, shortcuts, the API, Stream Deck and remote while the offline player is active. */
	onCommand: publicProcedure.subscription(() => fromIpcEvent<OfflineCommand>("downloads:command")),
	onStatus: publicProcedure.subscription(() => fromIpcEvent<DownloadStatus>("downloads:status")),
	onChange: publicProcedure.subscription(() => fromIpcEvent<{ statuses: DownloadStatus[]; downloaded: string[] }>("downloads:all")),
});
