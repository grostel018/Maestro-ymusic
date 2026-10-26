import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";

const entry = z.object({ name: z.string().min(1), source: z.string(), path: z.string().min(1) });

export const audioRouter = router({
	graph: publicProcedure.query(({ ctx }) => provider(ctx, "audio").getGraph()),
	autoeqSearch: publicProcedure.input(z.string().max(100)).query(({ ctx, input }) => provider(ctx, "audio").autoeqSearch(input)),
	autoeqLoad: publicProcedure.input(entry).mutation(({ ctx, input }) => provider(ctx, "audio").autoeqLoad(input)),
});
