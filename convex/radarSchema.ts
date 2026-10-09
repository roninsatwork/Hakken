import { defineTable } from "convex/server";
import { v } from "convex/values";

/** A column packed as `packColumn` writes it (`utils/packedColumns.ts`), as the other schemas declare it. */
const packedColumnValidator = v.union(v.string(), v.array(v.union(v.number(), v.null())));

/**
 * Brand radar (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 4): what Google's AI answers say about a website, read monthly
 * (`brandRadar.ts`). Shared: one record per website and country, bought once
 * a month for every company watching it.
 */
export const radarTables = {
  /** A website's month by month: AI answers naming it, the asks behind them, its own pages cited. Kept for good. */
  brandRadarMonths: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    /** "2026-10", oldest first. */
    months: v.array(v.string()),
    mentions: packedColumnValidator,
    asks: packedColumnValidator,
    pages: packedColumnValidator,
    updatedAt: v.number(),
  }).index("by_website_place", ["websiteId", "locationCode"]),

  /**
   * A website's questions this month, newest reading only: each question once
   * with how often it is asked a month, where in the answer the website is
   * first named (null where it is only cited), and the pages the answer
   * quotes — each page's address once a record, the questions pointing to
   * them by number (rule 2).
   */
  brandRadarQuestionParts: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    month: v.string(),
    /** Answers naming or citing it in all, as Google's AI answers hold them. */
    total: v.number(),
    questions: v.array(v.string()),
    volumes: packedColumnValidator,
    firstAt: packedColumnValidator,
    pages: v.array(v.string()),
    /** Where each question's pages start in `sourceOf`, and the pages themselves by number. */
    starts: packedColumnValidator,
    sourceOf: packedColumnValidator,
    pullId: v.id("seoDataPulls"),
    updatedAt: v.number(),
  }).index("by_website_place", ["websiteId", "locationCode"]),
};
