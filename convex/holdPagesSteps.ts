"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { rebuildHoldPagesHandler, rebuiltValidator, type Rebuilt } from "./holdPages";

/**
 * Your pages' rebuild, in Convex's Node runtime (collection-reliability-plan.md,
 * RR3): 512 MB rather than the default runtime's 64. It holds every source's
 * pages at once to join them — the sitemap, the crawl, the rankings, Search
 * Console, Analytics, the titles and Bing — and so grows with the website.
 * A file in the Node runtime may only hold actions: what the
 * rebuild does lives in `holdPages.ts`, and is only called here.
 */
export const rebuildHoldPages = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: rebuiltValidator,
  handler: async (ctx, args): Promise<Rebuilt> => await rebuildHoldPagesHandler(ctx, args),
});
