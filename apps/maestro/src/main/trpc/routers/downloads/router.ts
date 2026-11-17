import { fromIpcEvent } from "@main/trpc/fromIpcEvent";
import { provider } from "@main/trpc/provider";
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
	remove: publicProcedure.input(videoId).mutation(({ ctx, input }) => provider(ctx, "downloads").remove(input.videoId)),
	showInFolder: publicProcedure.input(videoId).mutation(({ ctx, input }) => provider(ctx, "downloads").showInFolder(input.videoId)),
	openFolder: publicProcedure.mutation(({ ctx }) => provider(ctx, "downloads").openFolder()),
	chooseFolder: publicProcedure.input(z.object({ move: z.boolean() })).mutation(({ ctx, input }) => provider(ctx, "downloads").chooseFolder(input.move)),
	onStatus: publicProcedure.subscription(() => fromIpcEvent<DownloadStatus>("downloads:status")),
	onChange: publicProcedure.subscription(() => fromIpcEvent<{ statuses: DownloadStatus[]; downloaded: string[] }>("downloads:all")),
});
