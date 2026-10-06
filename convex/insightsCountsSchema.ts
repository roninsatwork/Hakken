import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Insights' counts, kept as they change (docs/plans/active/insights-helpful-
 * content-plan.md, IH21): one row, rewritten by every write to Knowledge,
 * Helpful content, Who to follow or the topic list (`insightsCounts.ts`), so
 * a page view reads one row and never counts a list. Keys are topic keys
 * (`topics.ts`) and Who to follow's kinds.
 */
const tally = v.record(v.string(), v.number());

export const insightsCountsTables = {
  insightsCounts: defineTable({
    key: v.literal("all"),
    /** Published Knowledge articles, all and by topic: Insights' side menu. */
    knowledge: v.object({ all: v.number(), byTopic: tally }),
    /** Helpful content shown to readers, all and by topic, and its publications with how many each. */
    helpful: v.object({ all: v.number(), byTopic: tally, publications: v.array(v.object({ name: v.string(), count: v.number() })) }),
    /** Who to follow: everyone, by kind, by topic, and by both ("X__TRAFFIC") — exact totals under any filter. */
    follows: v.object({ all: v.number(), byKind: tally, byTopic: tally, byKindTopic: tally }),
    /** Every use of each topic, drafts too: Admin → Topics. */
    uses: v.record(v.string(), v.object({ knowledge: v.number(), helpful: v.number(), people: v.number() })),
    /** Helpful content's publications in Admin, drafts too: its Publication filter. */
    adminPublications: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
};
