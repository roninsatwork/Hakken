import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";

/**
 * What the AI engines actually search for when asked this site's questions.
 *
 * An engine does not answer the question it is given. It expands it into
 * related searches, reads what those return, and writes from that. Those
 * searches are the surface a site has to be visible on, and they have been
 * arriving in every answer we buy since the citations pipeline shipped — in
 * `fan_out_queries`, which the parser used to discard.
 *
 * Read through the company's own tracked prompts, so nothing starts from a
 * shared record and walks outward to find who is watching. The fan-out rows
 * are keyed on the question text, like citations, because the purchase is
 * shared; the company's own prompts are what scopes this read to the company.
 *
 * The intent beside each search comes from `seo.keyword-intent`, the same
 * judgment the rankings screen uses and the same store, so a phrase met on
 * both screens is judged once and paid for once.
 */
export const listWebsiteFanOutQueries = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("promptFanOutQueries"),
      queryText: v.string(),
      /** The question that produced it, so a reader knows what was asked. */
      prompt: v.string(),
      engines: v.array(v.string()),
      timesSeen: v.number(),
      lastSeenDay: v.string(),
      intent: v.union(v.string(), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    const prompts = await ctx.db
      .query("trackedPrompts")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(MAX_PROMPTS);

    // One row per search, however many engines produced it: a reader wants the
    // searches, and which engines reached them is a fact about each row rather
    // than a reason to print it three times.
    const merged = new Map<string, {
      _id: Id<"promptFanOutQueries">;
      queryText: string;
      prompt: string;
      engines: Set<string>;
      timesSeen: number;
      lastSeenDay: string;
      query: string;
    }>();

    for (const prompt of prompts) {
      const rows = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt", (q) => q.eq("prompt", prompt.prompt))
        .take(MAX_ROWS_PER_PROMPT);

      for (const row of rows) {
        const key = `${prompt.prompt}::${row.query}`;
        const held = merged.get(key);
        if (!held) {
          merged.set(key, {
            _id: row._id,
            queryText: row.queryText,
            prompt: prompt.prompt,
            engines: new Set([row.engine]),
            timesSeen: row.timesSeen,
            lastSeenDay: row.lastSeenDay,
            query: row.query,
          });
          continue;
        }
        held.engines.add(row.engine);
        held.timesSeen += row.timesSeen;
        if (row.lastSeenDay > held.lastSeenDay) held.lastSeenDay = row.lastSeenDay;
      }
    }

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = [...merged.values()]
      .filter((row) => !term || includesSearchTerm(row.queryText, term) || includesSearchTerm(row.prompt, term))
      // The searches an engine keeps returning to are the ones worth a page,
      // so the most persistent come first.
      .sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay));

    const paged = paginateItems(matching, args.page, args.pageSize);

    const withIntent = await Promise.all(paged.data.map(async (row) => {
      const intent = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.query))
        .unique();
      return {
        _id: row._id,
        queryText: row.queryText,
        prompt: row.prompt,
        engines: [...row.engines].sort(),
        timesSeen: row.timesSeen,
        lastSeenDay: row.lastSeenDay,
        intent: intent?.intent ?? null,
      };
    }));

    return { ...paged, data: withIntent };
  },
});

/** Questions read per site. The plan allowance is far below this. */
const MAX_PROMPTS = 200;

/** Fan-out rows read per question, across every engine and place. */
const MAX_ROWS_PER_PROMPT = 500;
