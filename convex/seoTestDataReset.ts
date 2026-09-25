import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { appError } from "./utils/appError";
import type { TableNames } from "./_generated/dataModel";

/**
 * Clear what DataForSEO sent back, so test databases do not bloat.
 *
 * Anthony, 2026-09-23: collecting regularly in the Planner's Test mode piles
 * up data fast, and this is run whenever a clean slate is wanted. Only the
 * collected data goes — and the small summaries worked out from it, so the
 * screens do not show numbers for data that no longer exists. Websites,
 * searches, questions, brand names, chosen competitors, cadences, schedules,
 * agents and their history are never touched.
 *
 * Refuses to run unless the deployment says it may: `SEO_TEST_DATA_RESET` must
 * be `allowed`, which is set on dev and never on a live deployment. Without
 * the confirm word it only counts. Deletes in small pages — a stored answer's
 * row can be most of a megabyte — and continues itself until every table is empty.
 *
 *   npx convex run seoTestDataReset:clearCollectedSeoData
 *   npx convex run seoTestDataReset:clearCollectedSeoData '{"confirm":"DELETE_SEO_DATA"}'
 */

const CONFIRM_WORD = "DELETE_SEO_DATA";

/** Every table holding what DataForSEO returned, or what was worked out from it. Page sizes suit each row's size. */
const COLLECTED_TABLES: ReadonlyArray<{ table: TableNames; page: number }> = [
  { table: "seoDataPulls", page: 16 },
  // The answers, kept apart from the requests since 2026-09-25. Small pages:
  // a row, whole answer or one part of one, can be most of a megabyte.
  { table: "seoPullAnswers", page: 8 },
  { table: "seoCycleLines", page: 500 },
  { table: "seoCollectionCycles", page: 200 },
  { table: "seoRunReports", page: 200 },
  { table: "seoKeywordPositions", page: 500 },
  { table: "seoWebsiteMetrics", page: 200 },
  { table: "aiCitations", page: 500 },
  // One row per answer, read by the AI answers screen. Missed at first, which
  // left every cleared answer still listed with nothing behind it.
  { table: "aiAnswers", page: 500 },
  // Worked out from the collected data for the Sites screens; stale without it.
  { table: "siteKeywordRanks", page: 500 },
  { table: "sitePageRanks", page: 500 },
  { table: "siteSections", page: 500 },
  { table: "siteDaySummaries", page: 500 },
  { table: "siteCitedPages", page: 500 },
  { table: "siteRivalAiDays", page: 500 },
  { table: "siteKeywordFeatures", page: 500 },
  { table: "siteCrawlPages", page: 500 },
  { table: "siteCrawlLinks", page: 500 },
  { table: "siteContentGaps", page: 500 },
  { table: "siteSummaryRequests", page: 500 },
  { table: "siteSerpPages", page: 200 },
  { table: "aiAnswerTexts", page: 100 },
  { table: "sitePageTypes", page: 500 },
  { table: "siteBacklinks", page: 500 },
  { table: "siteReferringDomains", page: 500 },
  { table: "siteAnchors", page: 500 },
  { table: "siteReferringIps", page: 500 },
  { table: "siteLinkDays", page: 500 },
  { table: "siteReferringSubnets", page: 500 },
  { table: "sitePaidKeywords", page: 500 },
  { table: "siteCrawls", page: 200 },
  { table: "promptFanOutQueries", page: 500 },
  { table: "promptFanOutDays", page: 500 },
  { table: "discoveredCompetitors", page: 500 },
  { table: "discoveredCompetitorDays", page: 500 },
  { table: "seoDayRollups", page: 500 },
  { table: "websiteSearchStats", page: 500 },
  { table: "websiteQuestionStats", page: 500 },
  { table: "websiteMoves", page: 500 },
];

/** Keep each pass comfortably inside an action's ten minutes; the rest continues in the next. */
const PASS_BUDGET_MS = 8 * 60 * 1000;

function assertAllowed() {
  if (process.env.SEO_TEST_DATA_RESET !== "allowed") {
    throw appError(
      "UNAUTHORIZED",
      "Clearing collected SEO data is switched off on this deployment. It only runs where SEO_TEST_DATA_RESET is set to allowed.",
    );
  }
}

export const clearCollectedSeoData = internalAction({
  args: { confirm: v.optional(v.string()) },
  returns: v.object({
    dryRun: v.boolean(),
    tables: v.array(v.object({ table: v.string(), rows: v.number() })),
    finished: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertAllowed();
    const started = Date.now();
    const deleting = args.confirm === CONFIRM_WORD;
    const tables: Array<{ table: string; rows: number }> = [];

    for (const { table, page } of COLLECTED_TABLES) {
      let rows = 0;
      let cursor: string | null = null;
      for (;;) {
        if (Date.now() - started > PASS_BUDGET_MS) {
          if (deleting) await ctx.scheduler.runAfter(0, internal.seoTestDataReset.clearCollectedSeoData, args);
          tables.push({ table, rows });
          return { dryRun: !deleting, tables, finished: false };
        }
        if (deleting) {
          const removed: number = await ctx.runMutation(internal.seoTestDataReset.deletePage, { table, page });
          rows += removed;
          if (removed < page) break;
        } else {
          const counted: { count: number; cursor: string; isDone: boolean } = await ctx.runQuery(
            internal.seoTestDataReset.countPage,
            { table, page, cursor },
          );
          rows += counted.count;
          if (counted.isDone) break;
          cursor = counted.cursor;
        }
      }
      tables.push({ table, rows });
    }
    return { dryRun: !deleting, tables, finished: true };
  },
});

export const countPage = internalQuery({
  args: { table: v.string(), page: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ count: v.number(), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    assertAllowed();
    const result = await ctx.db.query(collectedTable(args.table)).paginate({ cursor: args.cursor, numItems: args.page });
    return { count: result.page.length, cursor: result.continueCursor, isDone: result.isDone };
  },
});

export const deletePage = internalMutation({
  args: { table: v.string(), page: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    assertAllowed();
    const rows = await ctx.db.query(collectedTable(args.table)).take(args.page);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

/** Only ever a table on the list — never whatever name a caller passes. */
function collectedTable(name: string): TableNames {
  const entry = COLLECTED_TABLES.find((candidate) => candidate.table === name);
  if (!entry) throw appError("INVALID_INPUT", `${name} is not collected SEO data.`);
  return entry.table;
}
