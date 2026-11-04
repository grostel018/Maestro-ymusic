import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";

const id = z.object({ id: z.string() });

export const playlistsRouter = router({
	list: publicProcedure.query(({ ctx }) => {
		const p = provider(ctx, "playlists");
		return { playlists: p.list(), matching: p.isMatching };
	}),
	create: publicProcedure.input(z.object({ name: z.string() })).mutation(({ ctx, input }) => provider(ctx, "playlists").create(input.name)),
	rename: publicProcedure.input(id.extend({ name: z.string() })).mutation(({ ctx, input }) => provider(ctx, "playlists").rename(input.id, input.name)),
	remove: publicProcedure.input(id).mutation(({ ctx, input }) => provider(ctx, "playlists").remove(input.id)),
	removeTrack: publicProcedure.input(id.extend({ index: z.number().int().min(0) })).mutation(({ ctx, input }) => provider(ctx, "playlists").removeTrack(input.id, input.index)),
	addCurrent: publicProcedure.input(id).mutation(({ ctx, input }) => provider(ctx, "playlists").addCurrent(input.id)),
	saveQueue: publicProcedure.input(z.object({ name: z.string() })).mutation(({ ctx, input }) => provider(ctx, "playlists").saveQueue(input.name)),
	importFile: publicProcedure.input(z.object({ fileName: z.string().max(300), text: z.string().max(20_000_000) })).mutation(({ ctx, input }) => provider(ctx, "playlists").importFile(input.fileName, input.text)),
	play: publicProcedure.input(id.extend({ shuffle: z.boolean().optional() })).mutation(({ ctx, input }) => provider(ctx, "playlists").play(input.id, { shuffle: input.shuffle })),
	smartShuffle: publicProcedure.mutation(({ ctx }) => provider(ctx, "playlists").smartShuffle()),
});
