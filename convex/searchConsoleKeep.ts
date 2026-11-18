import { v } from "convex/values";

import { internalQuery } from "./_generated/server";

/**
 * Every search Google gives is kept line by line (Anthony, 18 November 2026:
 * "keep every search in the kept lists"). From 5 October to 18 November 2026
 * a keep rule dropped a search's lines when it got no click, ranked below
 * place 20 and was shown for one of the website's pages (finish-off-plan.md,
 * store less round two, D): about one line in nine of morehandles.co.uk's.
 * It was judged day by day, so Keywords on Last month showed 26,652 searches
 * where Google, asked for the same days, gave 30,962. The rule went, and the
 * days kept were asked of Google again (`searchConsolePageRefetch.ts`, pairs).
 *
 * What is left here: the searches the company tracks, which a long period's
 * memory guard never lets go (`searchConsoleLongLists.ts`, `MOST_PAIRS_HELD`).
 */

/** Tracked searches read for the memory guard. */
const TRACKED_READ = 500;

/** The searches the company tracks on the website, kept whatever their figures. */
export const trackedSearches = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await ctx.db
    .query("searchConsoleTracked")
    .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "query"))
    .take(TRACKED_READ)).map((row) => row.key),
});
