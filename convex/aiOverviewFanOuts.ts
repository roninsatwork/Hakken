import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";
import { findSeoLocation } from "./utils/seoLocations";
import type { PullForParse } from "./seoCollectionParse";
import { SHARED_LIMITS } from "./sharedLimits";

/**
 * Filing and reading Google's own fan-out searches (docs/plans/active/
 * fan-out-angles-plan.md, FA8; bought as `dataForSeoAiOverviewOperations.ts`
 * says). Each purchase is one question topic's AI Overviews; every search
 * they ran is kept under the topic and country with how many of them ran it,
 * and every company whose question has that topic reads them into its angles
 * (`fanOutAngles.ts`). Nothing of an overview is kept but its searches: its
 * answer is page text, which is never stored (user-sites-plan.md, "No page
 * text, still").
 */


/** A search as Google wrote it, trimmed and space-collapsed. */
function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * The searches in one purchase, each with how many of its AI Overviews ran
 * it — once per overview, however often one overview repeats it — most run
 * first. A shape it does not recognise is no searches, not an error.
 */
export function parseAiOverviewFanOuts(
  result: unknown,
  /** Searches kept, the most run first: the platform's setting (`sharedLimits.ts`). */
  limit: number = SHARED_LIMITS.overviewSearchesPerPurchase.fallback,
): Array<{ query: string; queryText: string; times: number }> {
  const first = Array.isArray(result) ? result[0] : result;
  const items = first && typeof first === "object" && Array.isArray((first as { items?: unknown }).items)
    ? (first as { items: unknown[] }).items
    : [];
  const found = new Map<string, { query: string; queryText: string; times: number }>();
  for (const item of items) {
    const searches = item && typeof item === "object" ? (item as { fan_out_queries?: unknown }).fan_out_queries : null;
    if (!Array.isArray(searches)) continue;
    const seen = new Set<string>();
    for (const search of searches) {
      if (typeof search !== "string") continue;
      const queryText = tidy(search);
      const query = queryText.toLowerCase();
      if (!query || seen.has(query)) continue;
      seen.add(query);
      const held = found.get(query);
      if (held) held.times += 1;
      else found.set(query, { query, queryText, times: 1 });
    }
  }
  return [...found.values()]
    .sort((left, right) => right.times - left.times || left.query.localeCompare(right.query))
    .slice(0, limit);
}

/** What a purchase was sent, read back: its topic, and the country as rows are keyed. */
function sentTopic(taskArgsJson: string | null): { topic: string; place: string } | null {
  try {
    const sent = JSON.parse(taskArgsJson ?? "{}") as { target?: Array<{ keyword?: unknown }>; location_code?: unknown };
    const topic = sent.target?.[0]?.keyword;
    if (typeof topic !== "string" || topic.length === 0) return null;
    const place = typeof sent.location_code === "number" ? findSeoLocation(sent.location_code)?.countryIso : undefined;
    return place ? { topic, place } : null;
  } catch {
    return null;
  }
}

/**
 * Count one purchase's searches under its topic. Filing the same purchase
 * again counts nothing twice: a row this purchase already counted is left.
 */
export const writeAiOverviewFanOuts = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    topic: v.string(),
    place: v.string(),
    day: v.string(),
    searches: v.array(v.object({ query: v.string(), queryText: v.string(), times: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const search of args.searches) {
      const held = await ctx.db
        .query("aiOverviewFanOuts")
        .withIndex("by_topic_place_query", (q) => q.eq("topic", args.topic).eq("place", args.place).eq("query", search.query))
        .unique();
      if (held?.lastPullId === args.pullId) continue;
      if (held) {
        await ctx.db.patch(held._id, {
          queryText: search.queryText,
          timesSeen: held.timesSeen + search.times,
          lastSeenDay: args.day > held.lastSeenDay ? args.day : held.lastSeenDay,
          lastPullId: args.pullId,
        });
        continue;
      }
      await ctx.db.insert("aiOverviewFanOuts", {
        topic: args.topic,
        place: args.place,
        query: search.query,
        queryText: search.queryText,
        timesSeen: search.times,
        firstSeenDay: args.day,
        lastSeenDay: args.day,
        lastPullId: args.pullId,
      });
    }
    return null;
  },
});

/**
 * File one bought purchase, from the parse step (`seoCollectionParse.ts`).
 * The searches are judged for what the searcher wants, as every fan-out
 * search is, on their own afterwards (`seoFiling.judgeKeywordsLater`).
 */
export async function fileAiOverviewPull(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: Pick<PullForParse, "resultJson" | "taskArgsJson" | "companyId" | "runDay">,
): Promise<null> {
  try {
    const sent = sentTopic(pull.taskArgsJson);
    if (!sent) throw appError("INVALID_INPUT", "This purchase does not say which topic it was for.");
    const { overviewSearchesPerPurchase } = await ctx.runQuery(internal.sharedLimits.getSharedLimits, {});
    const searches = parseAiOverviewFanOuts(JSON.parse(pull.resultJson ?? "[]"), overviewSearchesPerPurchase);
    await ctx.runMutation(internal.aiOverviewFanOuts.writeAiOverviewFanOuts, { pullId, ...sent, day: pull.runDay, searches });
    if (searches.length > 0) {
      await ctx.scheduler.runAfter(0, internal.seoFiling.judgeKeywordsLater, {
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        pullId,
        keywords: searches.map((search) => search.queryText),
      });
    }
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

/** A topic's Google fan-out searches in one country, the most run first — one more than asked, so a cut shows. */
export async function topicFanOuts(
  ctx: { db: QueryCtx["db"] },
  topic: string,
  place: string,
  limit: number,
): Promise<Doc<"aiOverviewFanOuts">[]> {
  if (!topic) return [];
  return await ctx.db
    .query("aiOverviewFanOuts")
    .withIndex("by_topic_place_seen", (q) => q.eq("topic", topic).eq("place", place))
    .order("desc")
    .take(limit + 1);
}
