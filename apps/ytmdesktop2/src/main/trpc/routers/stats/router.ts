import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";

export const statsRouter = router({
	summary: publicProcedure.query(({ ctx }) => provider(ctx, "stats").summary()),
	reset: publicProcedure.mutation(({ ctx }) => provider(ctx, "stats").reset()),
});
