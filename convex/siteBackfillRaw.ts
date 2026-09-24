import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { parseDomainCompetitors, parseLlmResponse, parseSeoResultFor, parseSerpPage } from "./dataForSeoParsers";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { AI_ENGINES, aiCitationOperationId, engineForOperationId } from "./seoAiEngines";
import { normaliseKeyword } from "./seoJudgments";
import { fileAnswerText } from "./siteAnswers";
import { fileSerpPage, serpSnapshotOf, serpSnapshotValidator } from "./siteSerp";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { kdBandFor, pagePath, rankedPositionValidator } from "./utils/siteShapes";

/**
 * Read the Phase 2 fields out of every result already stored.
 *
 * docs/plans/active/user-sites-plan.md, Phase 2: "Re-read the stored results
 * so existing days are filled in — free, no new DataForSEO call." The parser
 * files these fields for every new result; this is for the results stored
 * before it did. It reads each stored answer and writes **only** the new
 * fields — keyword difficulty, cost per click, trend, traffic and page
 * figures; DataForSEO's position bands and new / lost counts; link quality;
 * each checked results page; each AI answer's text; competitors' domain size —
 * and asks nothing of any model: no search, stance or competitor is judged
 * again. Then every watched site's summaries are rebuilt from the start.
 *
 *   npx convex run siteBackfillRaw:readStoredResults
 *
 * Safe to run again: every write replaces what the last run wrote.
 */

/** Stored results read per page. One can be most of a megabyte. */
const PULLS_PER_PAGE = 4;

/** Keywords patched per mutation. */
const KEYWORDS_PER_WRITE = 250;

/** Holds of one website whose discovered competitors are patched. */
const HOLDS_READ = 200;

const OPERATIONS = [
  "domain_ranked_keywords",
  "backlinks_summary",
  "domain_competitors",
  SEO_KEYWORD_CHECK_OPERATION,
  ...AI_ENGINES.map(aiCitationOperationId),
];

type Counts = { results: number; keywords: number; pages: number; answers: number; competitors: number; metrics: number };

export const readStoredResults = internalAction({
  args: { operationId: v.optional(v.string()) },
  returns: v.object({
    results: v.number(),
    keywords: v.number(),
    pages: v.number(),
    answers: v.number(),
    competitors: v.number(),
    metrics: v.number(),
    sites: v.number(),
  }),
  handler: async (ctx, args): Promise<Counts & { sites: number }> => {
    const counts: Counts = { results: 0, keywords: 0, pages: 0, answers: 0, competitors: 0, metrics: 0 };
    for (const operationId of args.operationId ? [args.operationId] : OPERATIONS) {
      let cursor: string | null = null;
      for (;;) {
        const page: { pullIds: Id<"seoDataPulls">[]; cursor: string; isDone: boolean } = await ctx.runQuery(
          internal.siteBackfillRaw.storedPulls,
          { operationId, cursor },
        );
        for (const pullId of page.pullIds) await readOne(ctx, pullId, counts);
        if (page.isDone) break;
        cursor = page.cursor;
      }
    }

    const sites: Array<{ websiteId: Id<"websites">; locationCode: number }> =
      await ctx.runQuery(internal.siteBackfill.watchedSites, {});
    for (const site of sites) {
      await ctx.runAction(internal.siteSummaries.rebuildSite, { ...site, fullSync: true });
    }
    return { ...counts, sites: sites.length };
  },
});

async function readOne(ctx: ActionCtx, pullId: Id<"seoDataPulls">, counts: Counts): Promise<void> {
  const pull = await ctx.runQuery(internal.seoCollectionParse.getPullForParse, { pullId });
  if (!pull?.resultJson) return;
  let result: unknown;
  try {
    result = JSON.parse(pull.resultJson);
  } catch {
    return;
  }
  counts.results += 1;
  const day = new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10);
  const sent = readSent(pull.taskArgsJson);

  if (engineForOperationId(pull.operationId)) {
    const parsed = parseLlmResponse(result);
    const filed: boolean = await ctx.runMutation(internal.siteBackfillRaw.fileStoredAnswer, {
      pullId,
      answer: parsed.answer,
      sources: parsed.sources.slice(0, 40).map((source) => source.url),
    });
    if (filed) counts.answers += 1;
    return;
  }

  if (pull.operationId === SEO_KEYWORD_CHECK_OPERATION) {
    const keyword = normaliseKeyword(typeof sent.keyword === "string" ? sent.keyword : "");
    if (!keyword) return;
    await ctx.runMutation(internal.siteBackfillRaw.fileStoredSerpPage, {
      pullId,
      keyword,
      locationCode: typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE,
      day,
      snapshot: serpSnapshotOf(parseSerpPage(result)),
    });
    counts.pages += 1;
    return;
  }

  if (!pull.websiteId) return;
  const websiteId = pull.websiteId as Id<"websites">;

  if (pull.operationId === "domain_competitors") {
    const rows = parseDomainCompetitors(result).flatMap((row) =>
      row.domainKeywords !== null || row.domainTraffic !== null
        ? [{
          host: row.host,
          ...(row.domainKeywords !== null ? { domainKeywords: row.domainKeywords } : {}),
          ...(row.domainTraffic !== null ? { domainTraffic: row.domainTraffic } : {}),
        }]
        : []);
    counts.competitors += await ctx.runMutation(internal.siteBackfillRaw.fileStoredCompetitorSizes, { websiteId, rows });
    return;
  }

  const parsed = parseSeoResultFor(pull.operationId, result, pull.target ?? undefined);
  if (!parsed) return;
  counts.metrics += await ctx.runMutation(internal.siteBackfillRaw.fileStoredMetrics, {
    pullId,
    metricsJson: JSON.stringify(parsed.metrics),
  });
  const positions = (parsed.positions ?? []).slice(0, 1_000);
  const locationCode = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
  for (let start = 0; start < positions.length; start += KEYWORDS_PER_WRITE) {
    counts.keywords += await ctx.runMutation(internal.siteBackfillRaw.fileStoredRankExtras, {
      websiteId,
      locationCode,
      entries: positions.slice(start, start + KEYWORDS_PER_WRITE),
    });
  }
}

function readSent(taskArgsJson: string | null): Record<string, unknown> {
  try {
    return JSON.parse(taskArgsJson ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** One page of an operation's stored results, oldest first, as ids. */
export const storedPulls = internalQuery({
  args: { operationId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ pullIds: v.array(v.id("seoDataPulls")), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_operation_submitted", (q) => q.eq("operationId", args.operationId))
      .paginate({ cursor: args.cursor, numItems: PULLS_PER_PAGE });
    return {
      pullIds: result.page.filter((pull) => pull.resultJson).map((pull) => pull._id),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** A stored answer's text, beside the answer row its parse wrote. False when there is no such row. */
export const fileStoredAnswer = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    answer: v.string(),
    sources: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const answer = await ctx.db
      .query("aiAnswers")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .first();
    if (!answer) return false;
    await fileAnswerText(ctx, {
      pullId: args.pullId,
      prompt: answer.prompt,
      engine: answer.engine,
      locationCode: answer.locationCode,
      day: answer.day,
      text: args.answer,
      sources: args.sources,
    });
    return true;
  },
});

export const fileStoredSerpPage = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    keyword: v.string(),
    locationCode: v.number(),
    day: v.string(),
    snapshot: serpSnapshotValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await fileSerpPage(ctx, args);
    return null;
  },
});

/** The competitors' whole-domain figures, on every hold's suggestion for them. Returns rows patched. */
export const fileStoredCompetitorSizes = internalMutation({
  args: {
    websiteId: v.id("websites"),
    rows: v.array(v.object({ host: v.string(), domainKeywords: v.optional(v.number()), domainTraffic: v.optional(v.number()) })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(HOLDS_READ);
    let patched = 0;
    for (const hold of holds) {
      for (const { host, ...sizes } of args.rows) {
        const found = await ctx.db
          .query("discoveredCompetitors")
          .withIndex("by_company_website_host", (q) => q.eq("companyWebsiteId", hold._id).eq("host", host))
          .unique();
        if (!found) continue;
        await ctx.db.patch(found._id, sizes);
        patched += 1;
      }
    }
    return patched;
  },
});

/** The metrics row a stored result's parse wrote, with the fields read out since. Returns rows changed. */
export const fileStoredMetrics = internalMutation({
  args: { pullId: v.id("seoDataPulls"), metricsJson: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(5);
    for (const row of rows) await ctx.db.patch(row._id, { metricsJson: args.metricsJson });
    return rows.length;
  },
});

/**
 * A stored ranked-keywords result's extras, onto the latest rankings it
 * covers. Results arrive oldest first, so the newest reading wins. A search's
 * own facts always apply; traffic and the page's figures only while the row
 * still ranks with the same page, because otherwise they describe another.
 */
export const fileStoredRankExtras = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), entries: v.array(rankedPositionValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    let patched = 0;
    for (const entry of args.entries) {
      const keyword = normaliseKeyword(entry.keyword);
      const row = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("keyword", keyword))
        .unique();
      if (!row) continue;
      const samePage = row.position !== undefined && Boolean(entry.url) && pagePath(entry.url) === row.page;
      const fields: Record<string, unknown> = {};
      const set = (key: string, value: unknown) => {
        if (value !== undefined) fields[key] = value;
      };
      set("cpc", entry.cpc);
      set("difficulty", entry.difficulty);
      set("kdBand", kdBandFor(entry.difficulty));
      set("trend", entry.trend);
      set("serpFeatures", entry.serpFeatures);
      if (samePage) {
        set("traffic", entry.traffic);
        set("trafficValue", entry.trafficValue);
        set("pageRank", entry.pageRank);
        set("pageReferringDomains", entry.pageReferringDomains);
        set("pageBacklinks", entry.pageBacklinks);
      }
      if (Object.keys(fields).length === 0) continue;
      await ctx.db.patch(row._id, fields);
      patched += 1;
    }
    return patched;
  },
});
