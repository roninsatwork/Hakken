import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { checkedDay } from "./utils/contentAdmin";
import { MAX_ARTICLES } from "./knowledgeArticles";
import { MAX_FOLLOWS } from "./newsFollows";
import { WEEK_COUNT_LIMIT, weekStart } from "./news";

/**
 * The numbers beside Learn's side menu (docs/plans/active/knowledge-news-and-
 * digest-plan.md, revised again 2026-10-01, R4): the stories of each kind that
 * arrived this week — the front page's own week, today and the six days before
 * it, so a number says what is new rather than how much has piled up — how many
 * people are worth following, and how many articles each topic has. `today` is
 * the reader's own calendar day. Every signed-in user's, as News is.
 */
export const getLearnMenuCounts = tenantQuery({
  args: { today: v.string() },
  returns: v.object({
    news: v.object({ all: v.number(), GOOGLE_UPDATE: v.number(), WEBSITE: v.number(), YOUTUBE: v.number(), X: v.number() }),
    follows: v.number(),
    articles: v.object({ all: v.number(), TRAFFIC: v.number(), RANKINGS: v.number(), AI_ANSWERS: v.number(), BACKLINKS: v.number() }),
  }),
  handler: async (ctx, args) => {
    const today = checkedDay(args.today, "Today");
    const week = await ctx.db
      .query("newsItems")
      .withIndex("by_published", (q) => q.gte("publishedAt", weekStart(today)))
      .take(WEEK_COUNT_LIMIT);
    const news = { all: week.length, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 };
    for (const item of week) news[item.kind] += 1;

    const follows = (await ctx.db.query("newsFollows").take(MAX_FOLLOWS)).length;

    const published = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED"))
      .take(MAX_ARTICLES);
    const articles = { all: published.length, TRAFFIC: 0, RANKINGS: 0, AI_ANSWERS: 0, BACKLINKS: 0 };
    for (const article of published) if (article.topic) articles[article.topic] += 1;

    return { news, follows, articles };
  },
});
