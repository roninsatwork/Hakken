import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { checkedDay } from "./utils/contentAdmin";
import { WEEK_COUNT_LIMIT, weekStart } from "./news";
import { readInsightsCounts } from "./insightsCounts";
import { readerFields } from "./contentTranslation";
import { topicsInOrder } from "./topics";

/**
 * The numbers beside Learn's side menu (docs/plans/active/knowledge-news-and-
 * digest-plan.md, revised again 2026-10-01, R4): the stories of each kind that
 * arrived this week — the front page's own week, today and the six days before
 * it, so a number says what is new rather than how much has piled up — how many
 * people are worth following, and how many articles each topic has. `today` is
 * the reader's own calendar day. Every signed-in user's, as News is.
 *
 * Topics are the shared list (`topics.ts`, insights-helpful-content-plan.md,
 * IH20), in its order and the reader's language; a topic's numbers are keyed by
 * its key, for Knowledge and for Helpful content (shown from phase 2, IH4).
 */
export const getLearnMenuCounts = tenantQuery({
  args: { today: v.string(), language: v.optional(v.string()) },
  returns: v.object({
    news: v.object({ all: v.number(), GOOGLE_UPDATE: v.number(), WEBSITE: v.number(), YOUTUBE: v.number(), X: v.number() }),
    follows: v.number(),
    topics: v.array(v.object({ key: v.string(), name: v.string() })),
    articles: v.object({ all: v.number(), byTopic: v.record(v.string(), v.number()) }),
    helpful: v.object({ all: v.number(), byTopic: v.record(v.string(), v.number()) }),
  }),
  handler: async (ctx, args) => {
    const today = checkedDay(args.today, "Today");
    const week = await ctx.db
      .query("newsItems")
      .withIndex("by_published", (q) => q.gte("publishedAt", weekStart(today)))
      .take(WEEK_COUNT_LIMIT);
    const news = { all: week.length, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 };
    for (const item of week) news[item.kind] += 1;

    // Kept as they change, in one row (insights-helpful-content-plan.md, IH21): nothing is counted here.
    const counts = await readInsightsCounts(ctx);
    const language = args.language ?? "en";
    const topics = await Promise.all((await topicsInOrder(ctx)).map(async (topic) => ({
      key: topic.key,
      name: (await readerFields(ctx, "topics", topic._id, { name: topic.nameEn }, language)).name,
    })));

    return {
      news,
      follows: counts.follows.all,
      topics,
      articles: counts.knowledge,
      helpful: { all: counts.helpful.all, byTopic: counts.helpful.byTopic },
    };
  },
});
