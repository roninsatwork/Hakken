import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Insights' counts, kept as they change (docs/plans/active/insights-helpful-
 * content-plan.md, IH21). Every write to Knowledge, Helpful content, Who to
 * follow or the topic list rewrites the one summary row from the lists — reads
 * that happen on a write, which is rare — so the side menu, Admin → Topics and
 * Who to follow's totals each read one row on a page view and never count.
 */

/** Rows read when the counts are rewritten: as many as each list is read whole (Helpful content's and Who to follow's 500). */
const COUNT_READ = 500;
/** Publications kept for readers' "Where they come from", the most articles first. */
export const PUBLICATIONS_KEPT = 20;

/** The key a Who to follow total under both filters is kept by. */
export const kindTopicKey = (kind: string, topic: string) => `${kind}__${topic}`;

export type InsightsCounts = Omit<Doc<"insightsCounts">, "_id" | "_creationTime" | "key" | "updatedAt">;

const EMPTY: InsightsCounts = {
  knowledge: { all: 0, byTopic: {} },
  helpful: { all: 0, byTopic: {}, publications: [] },
  follows: { all: 0, byKind: {}, byTopic: {}, byKindTopic: {} },
  uses: {},
  adminPublications: [],
};

async function summaryRow(ctx: QueryCtx) {
  return await ctx.db.query("insightsCounts").withIndex("by_key", (q) => q.eq("key", "all")).first();
}

/** The counts as last written; nothing yet reads as zero. */
export async function readInsightsCounts(ctx: QueryCtx): Promise<InsightsCounts> {
  const row = await summaryRow(ctx);
  if (!row) return EMPTY;
  return { knowledge: row.knowledge, helpful: row.helpful, follows: row.follows, uses: row.uses, adminPublications: row.adminPublications };
}

/** Rewrites the summary row from the lists. Called by every write that can change a count. */
export async function refreshInsightsCounts(ctx: MutationCtx): Promise<void> {
  const [knowledge, helpful, follows] = await Promise.all([
    ctx.db.query("knowledgeArticles").take(COUNT_READ),
    ctx.db.query("libraryArticles").withIndex("by_created").order("desc").take(COUNT_READ),
    ctx.db.query("newsFollows").take(COUNT_READ),
  ]);
  const bump = (tally: Record<string, number>, key: string | undefined) => {
    if (key) tally[key] = (tally[key] ?? 0) + 1;
  };
  const uses: InsightsCounts["uses"] = {};
  const countUse = (topic: string | undefined, field: "knowledge" | "helpful" | "people") => {
    if (!topic) return;
    uses[topic] ??= { knowledge: 0, helpful: 0, people: 0 };
    uses[topic][field] += 1;
  };

  const knowledgeCounts: InsightsCounts["knowledge"] = { all: 0, byTopic: {} };
  for (const article of knowledge) {
    countUse(article.topic, "knowledge");
    if (article.status !== "PUBLISHED") continue;
    knowledgeCounts.all += 1;
    bump(knowledgeCounts.byTopic, article.topic);
  }

  const helpfulCounts: InsightsCounts["helpful"] = { all: 0, byTopic: {}, publications: [] };
  const publications = new Map<string, number>();
  const adminPublications = new Set<string>();
  for (const article of helpful) {
    countUse(article.topic, "helpful");
    adminPublications.add(article.publication);
    if (!article.shown) continue;
    helpfulCounts.all += 1;
    bump(helpfulCounts.byTopic, article.topic);
    publications.set(article.publication, (publications.get(article.publication) ?? 0) + 1);
  }
  helpfulCounts.publications = [...publications]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "en-GB"))
    .slice(0, PUBLICATIONS_KEPT);

  const followCounts: InsightsCounts["follows"] = { all: 0, byKind: {}, byTopic: {}, byKindTopic: {} };
  for (const follow of follows) {
    countUse(follow.topic, "people");
    followCounts.all += 1;
    bump(followCounts.byKind, follow.kind);
    bump(followCounts.byTopic, follow.topic);
    if (follow.topic) bump(followCounts.byKindTopic, kindTopicKey(follow.kind, follow.topic));
  }

  const counts: InsightsCounts = {
    knowledge: knowledgeCounts,
    helpful: helpfulCounts,
    follows: followCounts,
    uses,
    adminPublications: [...adminPublications].sort((left, right) => left.localeCompare(right, "en-GB")),
  };
  const row = await summaryRow(ctx);
  if (row) await ctx.db.patch(row._id, { ...counts, updatedAt: Date.now() });
  else await ctx.db.insert("insightsCounts", { key: "all", ...counts, updatedAt: Date.now() });
}

/** For the migration that starts the row, and for tests. */
export const refreshInsightsCountsInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await refreshInsightsCounts(ctx);
    return null;
  },
});
