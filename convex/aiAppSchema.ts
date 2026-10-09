import { defineTable } from "convex/server";
import { v } from "convex/values";
import { aiEngineValidator } from "./seoAiEngines";

/**
 * What the AI apps show beside their answers (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 3, D5): one record per answer read from
 * one of the two apps (`APP_ENGINES`) or Google AI Mode — the businesses it put on
 * screen, the pages it read, and the searches it ran — kept as long as the
 * answer's wording (90 days) and cleared with it (`siteAnswers.deleteAnswerText`).
 * Shared: an answer is bought once for every company asking the question.
 */
/** A column packed as `packColumn` writes it (`utils/packedColumns.ts`), as the other schemas declare it. */
const packedColumnValidator = v.union(v.string(), v.array(v.union(v.number(), v.null())));

export const aiAppTables = {
  aiAnswerExtras: defineTable({
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    locationCode: v.number(),
    day: v.string(),
    /** The businesses shown as cards beside the answer, in order: ChatGPT's app only. */
    businesses: v.array(v.object({
      name: v.string(),
      host: v.optional(v.string()),
      rating: v.optional(v.number()),
      reviews: v.optional(v.number()),
      address: v.optional(v.string()),
    })),
    /** Every page it opened while answering, cited or not, once each: ChatGPT's app only. */
    read: v.array(v.string()),
    /** What it searched for before answering. */
    searches: v.array(v.string()),
  }).index("by_pull", ["pullId"]),

  /**
   * How often one search is asked of AI tools a month from one place, with
   * its last twelve months packed oldest first (`aiDemand.ts`): once per
   * search and place, shared, like `searchVolumes`; replaced each month.
   */
  /**
   * One Google check's AI Overview in small (`siteSerp.ts`): whether the
   * results page had one, and the websites it quoted — written beside the
   * page and cleared with it (90 days), so AI Overview gaps reads a few
   * hundred bytes a search instead of the whole page (500 searches read
   * 9.7 MB before, 2026-10-09).
   */
  serpOverviews: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    day: v.string(),
    pullId: v.id("seoDataPulls"),
    overview: v.boolean(),
    domains: v.array(v.string()),
  })
    .index("by_keyword_place_day", ["keyword", "locationCode", "day"])
    .index("by_pull", ["pullId"]),

  aiSearchVolumes: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    volume: v.union(v.number(), v.null()),
    months: packedColumnValidator,
    /** The month of the newest figure, "2026-09". */
    month: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index("by_keyword_place", ["keyword", "locationCode"]),
};
