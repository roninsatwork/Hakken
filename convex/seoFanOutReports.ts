import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import { pairedOwnedHold } from "./utils/websitePairing";
import { AI_ENGINES, fanOutPlace } from "./seoAiEngines";

/**
 * What the AI engines actually search for when asked this site's questions.
 *
 * An engine does not answer the question it is given. It expands it into
 * related searches, reads what those return, and writes from that. Those
 * searches are the surface a site has to be visible on, and they have been
 * arriving in every answer we buy since the citations pipeline shipped — in
 * `fan_out_queries`, which the parser used to discard.
 *
 * Read through the company's own hold on the website, so nothing starts from a
 * shared record and walks outward to find who is watching. The fan-out rows are
 * keyed on the question text, like citations, because the purchase is shared;
 * the hold is what scopes this read to the company.
 *
 * The intent beside each search comes from `seo.keyword-intent`, the same
 * judgment the rankings screen uses and the same store, so a phrase met on
 * both screens is judged once and paid for once.
 */
export const listWebsiteFanOutQueries = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    /** Only buying searches this site does not track — the cheapest new keyword ideas, already paid for. */
    buyingUntracked: v.optional(v.boolean()),
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
      /** Already on this site's list of searches, so "track it" has nothing to do. */
      tracked: v.boolean(),
      /** The list entry it matches, for "Untrack"; null when not tracked. */
      trackedKeywordId: v.union(v.id("websiteKeywords"), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    /** How many buying searches nobody tracks, for the filter that shows them. */
    buyingUntrackedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    // What this watcher's engines were sent, which is what the rows are keyed
    // on — another client watching the same site from another town has rows
    // of their own, and they are not this one's.
    const watcherPlace = (await pairedOwnedHold(ctx, companyWebsite) ?? companyWebsite).locationCode;

    /*
      The host's questions, not this company's copy of them.

      Still read through the company's own hold — the id came in scoped, and
      `companyWebsite.websiteId` is the entitlement — so nothing starts from a
      shared record and walks outward to find who is watching.
    */
    const prompts = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", companyWebsite.websiteId))
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

    let read = 0;
    // Every engine, not only the ones this site asks: another site putting the
    // same question to another engine has already paid for its searches.
    for (const prompt of prompts) for (const engine of AI_ENGINES) {
      // A ceiling on the whole read, not only per question: two hundred
      // questions at five hundred rows each was a hundred thousand documents
      // for one screen. Read by question, engine and this watcher's place
      // through the index, so no other town's rows are read at all.
      if (read >= MAX_ROWS_READ) break;
      const rows = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_query", (q) =>
          q.eq("prompt", prompt.prompt).eq("engine", engine).eq("place", fanOutPlace(engine, watcherPlace)))
        .take(Math.min(MAX_ROWS_PER_PROMPT, MAX_ROWS_READ - read));
      read += rows.length;

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
      .sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay))
      .slice(0, MAX_ROWS_JUDGED);

    // Intent and "already tracked" for every row, not just the page: the
    // filter for untracked buying searches has to know both before it can cut
    // a page. Bounded by the ceiling above; each is one point lookup.
    const judged = await Promise.all(matching.map(async (row) => {
      const [intent, tracked] = await Promise.all([
        ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", row.query)).unique(),
        ctx.db
          .query("websiteKeywords")
          .withIndex("by_website_keyword", (q) => q.eq("websiteId", companyWebsite.websiteId).eq("keyword", row.query))
          .first(),
      ]);
      return {
        _id: row._id,
        queryText: row.queryText,
        prompt: row.prompt,
        engines: [...row.engines].sort(),
        timesSeen: row.timesSeen,
        lastSeenDay: row.lastSeenDay,
        intent: intent?.intent ?? null,
        tracked: Boolean(tracked),
        trackedKeywordId: tracked?._id ?? null,
      };
    }));

    const isBuyingUntracked = (row: (typeof judged)[number]) => row.intent === "BUYING" && !row.tracked;
    const shown = args.buyingUntracked ? judged.filter(isBuyingUntracked) : judged;
    const paged = paginateItems(shown, args.page, args.pageSize);

    return { ...paged, buyingUntrackedCount: judged.filter(isBuyingUntracked).length };
  },
});

/** Questions read per site. The plan allowance is far below this. */
const MAX_PROMPTS = 200;

/** Fan-out rows read per question, across every engine and place. */
const MAX_ROWS_PER_PROMPT = 500;

/** Fan-out rows read for one screen, across every question. */
const MAX_ROWS_READ = 4_000;

/** Merged searches judged for one screen: the most persistent, which is what a page shows. */
const MAX_ROWS_JUDGED = 1_000;
