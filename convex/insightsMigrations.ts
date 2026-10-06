import type { MutationCtx } from "./_generated/server";
import { refreshInsightsCounts } from "./insightsCounts";
import { recutPublishedSections } from "./libraryArticles";
import { nameKeyOf } from "./newsFollows";
import { seedFirstTopics } from "./topics";

/**
 * Insights' one-off migrations (docs/plans/active/insights-helpful-content-
 * plan.md), registered by name in `dataMigrations.ts`. Each is one batch:
 * the lists they read are read whole at their limits.
 */

type OneBatch = { cursor: null; isDone: true; processed: number; updated: number };

/** The shared topic list's first rows, with their Italian (IH20). */
export async function addFirstTopics(ctx: MutationCtx): Promise<OneBatch> {
  const added = await seedFirstTopics(ctx);
  return { cursor: null, isDone: true, processed: 4, updated: added };
}

/**
 * Server-side reading (IH21): each Helpful content article's `shown`, each
 * Who to follow entry's `nameKey`, then the summary row of counts.
 */
export async function fillInsightsReading(ctx: MutationCtx): Promise<OneBatch> {
  const [articles, follows] = await Promise.all([ctx.db.query("libraryArticles").take(500), ctx.db.query("newsFollows").take(500)]);
  let updated = 0;
  for (const article of articles) {
    const shown = article.status === "IN_KNOWLEDGE" && Boolean(article.summaryEn?.trim());
    if (article.shown !== shown) {
      await ctx.db.patch(article._id, { shown });
      updated += 1;
    }
  }
  for (const follow of follows) {
    const nameKey = nameKeyOf(follow.name);
    if (follow.nameKey !== nameKey) {
      await ctx.db.patch(follow._id, { nameKey });
      updated += 1;
    }
  }
  await refreshInsightsCounts(ctx);
  return { cursor: null, isDone: true, processed: articles.length + follows.length, updated };
}

/** Helpful content's sections cut again without their reference lists, and embedded for a search by meaning (IH9). */
export async function recutHelpfulContent(ctx: MutationCtx): Promise<OneBatch> {
  const recut = await recutPublishedSections(ctx);
  return { cursor: null, isDone: true, processed: recut, updated: recut };
}
