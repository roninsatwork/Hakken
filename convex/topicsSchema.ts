import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Topics (docs/plans/active/insights-helpful-content-plan.md, IH20): one list
 * the super admin adds to, changes and deletes in Admin → Content → Topics,
 * shared by Knowledge, Helpful content and Who to follow, and listed in that
 * order in Insights' side menu and filters. Written once, in English; the
 * Translator writes every other language (`contentTranslation.ts`).
 *
 * What uses a topic keeps its `key`, never its id: a key stays the same when
 * the topic is renamed, and the four topics there were before this list —
 * TRAFFIC, RANKINGS, AI_ANSWERS, BACKLINKS — keep the keys their articles
 * already carry, so not one article had to be rewritten.
 */
export const topicTables = {
  topics: defineTable({
    /** Stable: what an article, a Helpful content article or a person keeps. */
    key: v.string(),
    nameEn: v.string(),
    /** Its place in menus and filters, lowest first. */
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_position", ["position"]),
};
