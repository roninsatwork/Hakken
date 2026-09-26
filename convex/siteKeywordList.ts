import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { KEYWORD_LIST_OPERATION_ID, KEYWORD_LIST_PAGE } from "./dataForSeoKeywordListOperations";
import { parseDomainRankedKeywords } from "./dataForSeoParsers";
import { expandSeoResult } from "./dataForSeoSlim";
import { replaceSameDayPosition } from "./seoKeywordChecks";
import { sentLimit, sentOffset } from "./sitePagedLists";
import { fileKeywordRank, requestSiteRebuild, type RankExtras } from "./siteRankings";
import { getErrorMessage } from "./utils/lang";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { readSentLocationCode } from "./utils/seoSentPlace";
import { featurePositionValidator, pagePath, rankedPositionValidator } from "./utils/siteShapes";
import { recomputeSearchStats } from "./websiteTrackingStats";

/**
 * Filing the full keyword list (`dataForSeoKeywordListOperations.ts`): every
 * keyword a site ranks for, up to its limit, a thousand a request.
 *
 * **One list, however many requests.** A list's pages are dated by the day
 * their collection was planned (`listPageOf` in `sitePagedLists.ts`), so its
 * keywords share a day, and "lost" is decided from the whole of it
 * (`completeRankedDay` in `siteSummaries.ts` reads the running count each
 * page records).
 *
 * **Filed in pieces.** A thousand keywords is several thousand reads and
 * writes, so a page is filed a hundred keywords at a time.
 */

/**
 * Keywords filed per mutation. A hundred, not the 250 it was: each keyword
 * reads rows other filings write too — what the search means, a competitor's
 * gap — and a shorter write is over before another reaches the same rows
 * (Korda's first full run, 2026-09-24).
 */
const POSITIONS_PER_WRITE = 100;

/** Feature appearances cleared per filing from older lists; the rest go next time. */
const OLD_FEATURES_CLEARED = 500;

/** A host's own tracked searches, read so the ones in the list update their summaries. */
const TRACKED_SEARCHES_READ = 1_000;

type RankedPosition = Infer<typeof rankedPositionValidator>;

/** The Sites extras of one parsed ranking: everything but the ranking itself. */
export function rankExtrasOf(entry: RankedPosition): RankExtras {
  const {
    cpc, difficulty, trend, serpFeatures, traffic, trafficValue, pageRank, pageReferringDomains, pageBacklinks,
    competition, competitionLevel, searchIntent, resultsCount, previousPositionDfs, movementDfs,
  } = entry;
  return {
    cpc, difficulty, trend, serpFeatures, traffic, trafficValue, pageRank, pageReferringDomains, pageBacklinks,
    competition, competitionLevel, searchIntent, resultsCount, previousPositionDfs, movementDfs,
  };
}

/**
 * File a site's rankings from one answer: the dated position of each search,
 * the summaries of the ones on its own list, and the Sites screens' latest
 * ranking. Shared by the everyday ranked-keywords filing and the full list.
 */
export async function fileRankedPositions(
  ctx: MutationCtx,
  args: {
    websiteId: Id<"websites">;
    pullId: Id<"seoDataPulls">;
    day: string;
    /** As sent; absent when the registry default went. */
    locationCode?: number;
    positions: ReadonlyArray<RankedPosition>;
  },
): Promise<void> {
  const now = Date.now();
  // The searches any company tracks for this host, so the ones a
  // ranked-keywords pull happens to cover bring their summaries up to date
  // too. Only those: a large site ranks for thousands of phrases nobody is
  // tracking. Read across companies because the summaries are facts about
  // the website; each company reads them only for its own list.
  const tracked = new Set((await ctx.db
    .query("websiteKeywords")
    .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
    .take(TRACKED_SEARCHES_READ))
    .map((row) => row.keyword));
  const place = args.locationCode ?? DEFAULT_LOCATION_CODE;

  for (const entry of args.positions) {
    // The same keyword measured twice on one day from one place is one fact,
    // so an earlier row is replaced rather than joined by a second. From
    // another place it is another fact, and stays.
    await replaceSameDayPosition(ctx, {
      websiteId: args.websiteId,
      keyword: entry.keyword,
      day: args.day,
      ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
    });

    await ctx.db.insert("seoKeywordPositions", {
      websiteId: args.websiteId,
      keyword: entry.keyword,
      day: args.day,
      ...(entry.position !== undefined ? { position: entry.position } : {}),
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.searchVolume !== undefined ? { searchVolume: entry.searchVolume } : {}),
      // Always written, so a watcher's view can be read through the place
      // index. Unset means the registry default was sent.
      locationCode: place,
      pullId: args.pullId,
      createdAt: now,
    });
    if (tracked.has(entry.keyword)) {
      await recomputeSearchStats(ctx, { websiteId: args.websiteId, keyword: entry.keyword, locationCode: place });
    }
    // The Sites screens' latest ranking of this search, from this place.
    if (entry.position !== undefined) {
      await fileKeywordRank(ctx, {
        websiteId: args.websiteId,
        locationCode: place,
        keyword: entry.keyword,
        day: args.day,
        position: entry.position,
        ...(entry.url ? { url: entry.url } : {}),
        ...(entry.searchVolume !== undefined ? { volume: entry.searchVolume } : {}),
        extras: rankExtrasOf(entry),
      });
    }
  }
}

/**
 * One page's first keywords — replacing what an earlier parse of this pull
 * filed. Its figures come last (`finishListPage`), once every keyword on the
 * page is filed: until then the page does not count towards the list being
 * whole, so a page half-filed can never mark the rest of the list lost
 * (collection reliability plan, 2.2).
 */
export const writeListPage = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    day: v.string(),
    locationCode: v.number(),
    positions: v.array(rankedPositionValidator),
    features: v.array(featurePositionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("seoWebsiteMetrics").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(10)) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("seoKeywordPositions").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(1_100)) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("siteKeywordFeatures").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(1_100)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.patch(args.pullId, { error: undefined });

    // Where the site shows in AI Overviews, answer boxes and map packs: this
    // list's, with an older list's cleared a batch at a time.
    const older = await ctx.db
      .query("siteKeywordFeatures")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).lt("day", args.day))
      .take(OLD_FEATURES_CLEARED);
    for (const row of older) await ctx.db.delete(row._id);
    for (const feature of args.features) {
      await ctx.db.insert("siteKeywordFeatures", {
        websiteId: args.websiteId,
        locationCode: args.locationCode,
        keyword: feature.keyword,
        feature: feature.feature,
        ...(feature.position !== undefined ? { position: feature.position } : {}),
        ...(feature.url ? { url: feature.url, page: pagePath(feature.url) } : {}),
        day: args.day,
        pullId: args.pullId,
        updatedAt: Date.now(),
      });
    }

    await fileRankedPositions(ctx, args);
    return null;
  },
});

/**
 * A page's figures, once every keyword on it is filed: now it counts towards
 * the list being whole, and the site's summaries are rebuilt from it.
 */
export const finishListPage = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    day: v.string(),
    locationCode: v.number(),
    metricsJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("seoWebsiteMetrics", {
      websiteId: args.websiteId,
      day: args.day,
      operationId: KEYWORD_LIST_OPERATION_ID,
      pullId: args.pullId,
      metricsJson: args.metricsJson,
      locationCode: args.locationCode,
      createdAt: Date.now(),
    });
    await requestSiteRebuild(ctx, args.websiteId, args.locationCode);
    return null;
  },
});

/**
 * What one page says about the whole list, read from its answer as stored:
 * DataForSEO's total across every row kind asked for, the rows the page
 * brought, and any the stored copy had to drop to fit. The parsed keywords
 * alone cannot say it — they are the organic rows only (collection
 * reliability plan, 2.1).
 */
function listPageFacts(raw: unknown): { total: number | null; items: number; dropped: number } {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const record = first !== null && typeof first === "object" ? (first as Record<string, unknown>) : {};
  const packed = record.packedRanked !== null && typeof record.packedRanked === "object"
    ? (record.packedRanked as { rows?: unknown; dropped?: unknown })
    : null;
  const dropped = typeof packed?.dropped === "number" ? packed.dropped : 0;
  const kept = Array.isArray(packed?.rows) ? packed.rows.length : Array.isArray(record.items) ? record.items.length : 0;
  return {
    total: typeof record.total_count === "number" ? record.total_count : null,
    items: typeof record.items_count === "number" ? record.items_count : kept + dropped,
    dropped,
  };
}

/** More of a page's keywords, after its first write. */
export const writeListPositions = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    day: v.string(),
    locationCode: v.number(),
    positions: v.array(rankedPositionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await fileRankedPositions(ctx, args);
    return null;
  },
});

/** File one page of a full keyword list. Failures are recorded on the pull, as every parse does. */
export async function fileKeywordListPull(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: {
    websiteId: Id<"websites"> | null;
    resultJson: string | null;
    taskArgsJson: string | null;
    target: string | null;
    companyId: Id<"companies"> | null;
  },
): Promise<null> {
  if (!pull.resultJson || !pull.websiteId) return null;
  const websiteId = pull.websiteId;
  try {
    const raw = JSON.parse(pull.resultJson) as unknown;
    const facts = listPageFacts(raw);
    const parsed = parseDomainRankedKeywords(expandSeoResult(raw));
    const offset = sentOffset(pull.taskArgsJson);
    const locationCode = readSentLocationCode(pull.taskArgsJson ?? undefined) ?? DEFAULT_LOCATION_CODE;
    const listPage: { day: string; companyId: Id<"companies"> | null } | null =
      await ctx.runQuery(internal.sitePagedLists.listPageOf, { pullId });
    if (!listPage) return null;

    const positions = parsed.positions ?? [];
    // Every row kind asked for, not the organic count: the pages are counted
    // in rows, and paging by the organic count left a list's tail unbought.
    const total = facts.total ?? (typeof parsed.metrics.rankedKeywords === "number" ? parsed.metrics.rankedKeywords : null);
    // What decides whether the list is whole (`listDayComplete` in `siteSummaries.ts`).
    const metrics = {
      ...parsed.metrics,
      returnedKeywords: offset + positions.length,
      listOffset: offset,
      listLimit: sentLimit(pull.taskArgsJson) ?? KEYWORD_LIST_PAGE,
      listItems: facts.items,
      listDropped: facts.dropped,
      ...(facts.total !== null ? { listTotal: facts.total } : {}),
    };
    const chunks: RankedPosition[][] = [];
    for (let start = 0; start < positions.length; start += POSITIONS_PER_WRITE) {
      chunks.push(positions.slice(start, start + POSITIONS_PER_WRITE));
    }
    await ctx.runMutation(internal.siteKeywordList.writeListPage, {
      pullId,
      websiteId,
      day: listPage.day,
      locationCode,
      positions: chunks[0] ?? [],
      features: parsed.featurePositions ?? [],
    });
    for (const chunk of chunks.slice(1)) {
      await ctx.runMutation(internal.siteKeywordList.writeListPositions, {
        pullId, websiteId, day: listPage.day, locationCode, positions: chunk,
      });
    }
    await ctx.runMutation(internal.siteKeywordList.finishListPage, {
      pullId, websiteId, day: listPage.day, locationCode, metricsJson: JSON.stringify(metrics),
    });

    if (offset === 0 && total !== null) {
      await ctx.runMutation(internal.sitePagedLists.queueListPages, { pullId, total });
    }
    // Judged after the filing, on its own (`judgeKeywordsLater`): a judging
    // failure no longer marks a correctly filed list as failed.
    await ctx.scheduler.runAfter(0, internal.seoFiling.judgeKeywordsLater, {
      ...(listPage.companyId ? { companyId: listPage.companyId } : {}),
      pullId,
      host: pull.target ?? "",
      websiteId,
      keywords: positions.map((entry) => entry.keyword),
    });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}
