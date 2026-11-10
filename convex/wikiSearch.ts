import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { linkKeyFor } from "./wikiRewriteService";

/**
 * The wiki's text search, as the page chooser's shortlist uses it
 * (`wikiActions.selectWikiContextForQuery`, 2026-11-10).
 *
 * The chooser used to read the whole index: up to 250 entries past
 * `WIKI_INDEX_FULL_LIMIT`. Another app on this code measured a list that long
 * taking the Fast Chat model of the day 50–104 seconds to read, whatever the thinking
 * setting, against a few seconds for a short one. The search narrows it; the
 * model still does the choosing.
 *
 * Its own module because `wikiPages.ts` is past the size ceiling and frozen in
 * its band (src/module-size-drift.test.ts).
 */

/**
 * The pages a question's own words reach, best match first, as index keys.
 *
 * Keys only: the caller intersects them with the index it already built, so
 * which kinds a surface may see (customer pages, source notes) is decided in
 * one place, `wikiPages.getWikiIndexInternal`, never twice.
 */
export const searchWikiPageKeysInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    query: v.string(),
    limit: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const needle = args.query.trim().slice(0, 200);
    if (!needle) return [];
    const matched = await ctx.db
      .query("wikiPages")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", needle).eq("companyId", args.companyId)
      )
      .take(Math.min(Math.max(args.limit, 1), 100));
    return matched.map((page) => linkKeyFor(page.kind, page.subjectKey));
  },
});
