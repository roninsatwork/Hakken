import { getDocumentSize, v, type Value } from "convex/values";

import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { lostKeywordsKeptFrom } from "./seoCollectionPolicy";

/**
 * How much DataForSEO's data takes up, table by table and website by website
 * (docs/plans/active/dataforseo-cost-plan.md, step 0): run by hand on a
 * deployment, before and after each change, as `searchConsoleTidy:keptSize`
 * is for Search Console. Sizes are each row as Convex counts it
 * (`getDocumentSize`: nine bytes a number, a string's own bytes) — until
 * 2026-10-08 each row as JSON, which counted `0` as one byte and so read
 * number-heavy tables at a third of their size. Reads whole tables a page at
 * a time: a measure, not a screen.
 */

/** The tables the DataForSEO side keeps. */
const TABLES = [
  "seoDataPulls", "seoPullAnswers", "seoCycleLines", "seoWebsiteMetrics", "keywordPositionMonths",
  "siteKeywordRanks", "siteKeywordFeatures", "sitePageRanks", "siteSections", "siteDaySummaries", "sitePaidKeywords",
  "siteBacklinks", "siteReferringDomainParts", "siteAnchorParts", "siteReferringIpParts", "siteLinkWeeks",
  "siteCrawls", "siteCrawlPages", "siteCrawlLinks", "siteSitemapParts", "siteCitedPages",
  "siteListCopies", "siteListCopyParts", "siteContentGaps", "holdPages", "siteListAiDays",
  "aiAnswers", "aiCitations", "aiAnswerTexts", "aiAnswerIndex", "promptFanOutQueries", "promptFanOutDays", "siteSerpPages",
  "discoveredCompetitors", "websiteSearchStats", "websiteQuestionStats", "siteSummaryRequests",
] as const;

/** Rows read per page: the large rows a few at a time, so no read passes 16 MB. */
const PAGE: Partial<Record<(typeof TABLES)[number], number>> = {
  seoPullAnswers: 8,
  siteListCopyParts: 8,
  siteReferringDomainParts: 20,
  siteAnchorParts: 20,
  siteReferringIpParts: 20,
  aiAnswerTexts: 100,
  siteSerpPages: 100,
};
const DEFAULT_PAGE = 500;

const tableValidator = v.union(...TABLES.map((table) => v.literal(table)));

/** One page of a table: its rows and bytes, and each website's share where a row names its website. */
export const tablePage = internalQuery({
  args: { table: tableValidator, cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.number(),
    bytes: v.number(),
    websites: v.array(v.object({ websiteId: v.string(), rows: v.number(), bytes: v.number() })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query(args.table as TableNames).paginate({ cursor: args.cursor, numItems: PAGE[args.table] ?? DEFAULT_PAGE });
    let bytes = 0;
    const websites = new Map<string, { rows: number; bytes: number }>();
    for (const row of page.page as Array<Record<string, Value>>) {
      const size = getDocumentSize(row);
      bytes += size;
      const websiteId = (row.websiteId ?? row.mentionedWebsiteId ?? row.companyWebsiteId) as string | undefined;
      if (websiteId === undefined) continue;
      const held = websites.get(websiteId) ?? { rows: 0, bytes: 0 };
      websites.set(websiteId, { rows: held.rows + 1, bytes: held.bytes + size });
    }
    return {
      rows: page.page.length,
      bytes,
      websites: [...websites].map(([websiteId, held]) => ({ websiteId, ...held })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * A page of the latest rankings: each website's rows, those marked lost, and
 * those lost before the 90 days a lost keyword is kept — what the next
 * rebuild removes (keep-less-history-plan.md, 5.7).
 */
export const lostRanksPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), lostBefore: v.string() },
  returns: v.object({
    websites: v.array(v.object({ websiteId: v.string(), rows: v.number(), lost: v.number(), expired: v.number() })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("siteKeywordRanks").paginate({ cursor: args.cursor, numItems: DEFAULT_PAGE });
    const websites = new Map<string, { rows: number; lost: number; expired: number }>();
    for (const row of page.page) {
      const held = websites.get(row.websiteId) ?? { rows: 0, lost: 0, expired: 0 };
      held.rows += 1;
      if (row.position === undefined) held.lost += 1;
      if (row.position === undefined && row.day < args.lostBefore) held.expired += 1;
      websites.set(row.websiteId, held);
    }
    return { websites: [...websites].map(([websiteId, held]) => ({ websiteId, ...held })), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Every website's rankings, those marked lost and those the next rebuild removes, largest first. */
export const measureLostRanks = internalAction({
  args: {},
  returns: v.array(v.object({ host: v.string(), rows: v.number(), lost: v.number(), expired: v.number() })),
  handler: async (ctx): Promise<Array<{ host: string; rows: number; lost: number; expired: number }>> => {
    const lostBefore = lostKeywordsKeptFrom(new Date().toISOString().slice(0, 10));
    const totals = new Map<string, { rows: number; lost: number; expired: number }>();
    for (let cursor: string | null = null; ;) {
      const page: { websites: Array<{ websiteId: string; rows: number; lost: number; expired: number }>; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.seoStorageMeasure.lostRanksPage, { cursor, lostBefore });
      for (const { websiteId, ...counts } of page.websites) {
        const held = totals.get(websiteId) ?? { rows: 0, lost: 0, expired: 0 };
        totals.set(websiteId, { rows: held.rows + counts.rows, lost: held.lost + counts.lost, expired: held.expired + counts.expired });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const out: Array<{ host: string; rows: number; lost: number; expired: number }> = [];
    for (const [websiteId, counts] of totals) {
      const host: string | null = await ctx.runQuery(internal.seoStorageMeasure.hostOf, { websiteId });
      out.push({ host: host ?? websiteId, ...counts });
    }
    return out.sort((left, right) => right.rows - left.rows);
  },
});

/** A page of raw answers: their bytes by age, to see what keeping them 7 days would leave. */
export const rawAnswerAges = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ week: v.number(), month: v.number(), older: v.number(), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("seoPullAnswers").paginate({ cursor: args.cursor, numItems: 8 });
    const day = 24 * 60 * 60 * 1000;
    let week = 0;
    let month = 0;
    let older = 0;
    for (const row of page.page) {
      const size = getDocumentSize(row);
      const age = Date.now() - row.storedAt;
      if (age <= 7 * day) week += size;
      else if (age <= 30 * day) month += size;
      else older += size;
    }
    return { week, month, older, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A website's host, for the report — named by the website, or by a company's hold of it (its relationship beside it). */
export const hostOf = internalQuery({
  args: { websiteId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const hold = ctx.db.normalizeId("companyWebsites", args.websiteId);
    if (hold) {
      const held = await ctx.db.get(hold);
      const website = held ? await ctx.db.get(held.websiteId) : null;
      return website ? `${website.displayHost ?? website.host} (${held?.relationship ?? "OWNED"} hold)` : null;
    }
    const websiteId = ctx.db.normalizeId("websites", args.websiteId);
    const website = websiteId ? await ctx.db.get(websiteId) : null;
    return website?.displayHost ?? website?.host ?? null;
  },
});

const mb = (bytes: number) => Math.round(bytes / 100_000) / 10;

/**
 * Every DataForSEO table's rows and megabytes, largest first, and the
 * websites taking most of each. `tables` narrows it; `top` is how many
 * websites to name per table.
 */
export const measureSeoStorage = internalAction({
  args: { tables: v.optional(v.array(tableValidator)), top: v.optional(v.number()) },
  returns: v.object({
    totalMb: v.number(),
    tables: v.array(v.object({
      table: v.string(),
      rows: v.number(),
      mb: v.number(),
      websites: v.array(v.object({ host: v.string(), rows: v.number(), mb: v.number() })),
    })),
  }),
  handler: async (ctx, args) => {
    const report = [];
    const hosts = new Map<string, string>();
    for (const table of args.tables ?? TABLES) {
      let rows = 0;
      let bytes = 0;
      const byWebsite = new Map<string, { rows: number; bytes: number }>();
      for (let cursor: string | null = null; ;) {
        const page: { rows: number; bytes: number; websites: Array<{ websiteId: string; rows: number; bytes: number }>; continueCursor: string; isDone: boolean } =
          await ctx.runQuery(internal.seoStorageMeasure.tablePage, { table, cursor });
        rows += page.rows;
        bytes += page.bytes;
        for (const one of page.websites) {
          const held = byWebsite.get(one.websiteId) ?? { rows: 0, bytes: 0 };
          byWebsite.set(one.websiteId, { rows: held.rows + one.rows, bytes: held.bytes + one.bytes });
        }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      const leaders = [...byWebsite].sort((one, two) => two[1].bytes - one[1].bytes).slice(0, args.top ?? 3);
      const websites = [];
      for (const [websiteId, held] of leaders) {
        if (!hosts.has(websiteId)) hosts.set(websiteId, (await ctx.runQuery(internal.seoStorageMeasure.hostOf, { websiteId })) ?? websiteId);
        websites.push({ host: hosts.get(websiteId)!, rows: held.rows, mb: mb(held.bytes) });
      }
      report.push({ table, rows, mb: mb(bytes), websites });
    }
    report.sort((one, two) => two.mb - one.mb);
    return { totalMb: Math.round(report.reduce((sum, one) => sum + one.mb, 0) * 10) / 10, tables: report };
  },
});
