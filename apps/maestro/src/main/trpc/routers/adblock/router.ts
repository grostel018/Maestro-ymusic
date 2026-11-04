import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";

export const adblockRouter = router({
	stats: publicProcedure.query(({ ctx }) => provider(ctx, "adblock").stats()),
});
