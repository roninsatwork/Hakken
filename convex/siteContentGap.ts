import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { gapRebuildKey } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import { GAP_KEYWORDS_PER_RIVAL, rankIntentValidator, type RankIntent } from "./utils/siteShapes";

/**
 * The content gap: searches the rest of a site's group ranks for and the site
 * does not.
 *
 * Every hold is a Site (D17), so every hold has a gap: an owned site's is what
 * its competitors rank for and it does not; a competitor's is what the owned
 * site and the other competitors rank for and it does not. It depends on which
 * rivals the company chose, so it is kept per hold rather than per website,
 * and rebuilt whenever any site in the group is (`siteSummaries.requestGapsFor`).
 * Each rival's searches are read from its latest rankings, best-searched first,
 * and checked against the site's own a page at a time, so no read grows with
 * the size of either site.
 *
 * **Bounded, and says so.** A rival is read to its `KEYWORDS_PER_RIVAL`
 * most-searched keywords. A site that ranks for fifty thousand searches has a
 * long tail nobody writes content for; the gap is about the searches worth
 * having, and the screen names the ceiling rather than implying it read all.
 */

/** A rival's keywords read, most-searched first. The page names this ceiling. */
const KEYWORDS_PER_RIVAL = GAP_KEYWORDS_PER_RIVAL;

/** Rivals compared for one site. More than this is a plan conversation. */
const MAX_RIVALS = 25;

/** Keywords read or checked per call. */
const PAGE = 500;

/** Gap rows written or removed per mutation. */
const WRITE_BATCH = 400;

type GapRow = {
  keyword: string;
  volume: number;
  volumeKnown: boolean;
  intent: RankIntent;
  rivals: Array<{ websiteId: Id<"websites">; position: number }>;
};

export const rebuildGap = internalAction({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const key = gapRebuildKey(args.companyWebsiteId);
    // One gap rebuild per hold at a time: it runs for minutes, every site
    // rebuild in the group asks for it again, and two at once each deleted
    // what the other wrote (collection reliability plan, 2.3).
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteContentGap.rebuildGap, args);
      return null;
    }
    try {
      return await rebuildGapNow(ctx, args);
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key });
    }
  },
});

async function rebuildGapNow(ctx: ActionCtx, args: { companyWebsiteId: Id<"companyWebsites"> }): Promise<null> {
  const context: { websiteId: Id<"websites">; locationCode: number; rivals: Id<"websites">[] } | null =
    await ctx.runQuery(internal.siteContentGap.gapContext, { companyWebsiteId: args.companyWebsiteId });
  if (!context) return null;

  const gaps = new Map<string, GapRow>();
  for (const rivalId of context.rivals) {
    let cursor: string | null = null;
    let read = 0;
    while (read < KEYWORDS_PER_RIVAL) {
      const page: { rows: Array<Pick<Doc<"siteKeywordRanks">, "keyword" | "position" | "volume" | "volumeKnown" | "intent">>; cursor: string; isDone: boolean } =
        await ctx.runQuery(internal.siteContentGap.rivalKeywords, {
          websiteId: rivalId,
          locationCode: context.locationCode,
          cursor,
        });
      read += page.rows.length;
      const ranking = page.rows.filter((row) => row.position !== undefined);
      const ours: string[] = await ctx.runQuery(internal.siteContentGap.keywordsSiteRanksFor, {
        websiteId: context.websiteId,
        locationCode: context.locationCode,
        keywords: ranking.map((row) => row.keyword),
      });
      const held = new Set(ours);
      for (const row of ranking) {
        if (held.has(row.keyword)) continue;
        const gap = gaps.get(row.keyword) ?? {
          keyword: row.keyword,
          volume: row.volume,
          volumeKnown: row.volumeKnown,
          intent: row.intent,
          rivals: [],
        };
        gap.rivals.push({ websiteId: rivalId, position: row.position as number });
        if (row.volumeKnown && row.volume > gap.volume) {
          gap.volume = row.volume;
          gap.volumeKnown = true;
        }
        gaps.set(row.keyword, gap);
      }
      if (page.isDone) break;
      cursor = page.cursor;
    }
  }

  const rebuildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = [...gaps.values()];
  for (let start = 0; start < rows.length; start += WRITE_BATCH) {
    await ctx.runMutation(internal.siteContentGap.writeGaps, {
      companyWebsiteId: args.companyWebsiteId,
      rebuildId,
      rows: rows.slice(start, start + WRITE_BATCH),
    });
  }
  let cursor: string | null = null;
  for (;;) {
    const result: { cursor: string; isDone: boolean } = await ctx.runMutation(internal.siteContentGap.removeStaleGaps, {
      companyWebsiteId: args.companyWebsiteId,
      rebuildId,
      cursor,
    });
    if (result.isDone) break;
    cursor = result.cursor;
  }
  return null;
}

/**
 * The site, the place its group is read from, and the rest of its group: the
 * owned site and the competitors tracked against it, less the site itself.
 * Null for a competitor watched against nothing, which has no group.
 */
export const gapContext = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(
    v.null(),
    v.object({ websiteId: v.id("websites"), locationCode: v.number(), rivals: v.array(v.id("websites")) }),
  ),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const owner = isTrackedHold(hold) ? await pairedOwnedHold(ctx, hold) : hold;
    if (!owner) return null;
    const competitors = (await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_against", (q) => q.eq("companyId", owner.companyId).eq("againstWebsiteId", owner.websiteId))
      .take(MAX_RIVALS))
      .filter(isTrackedHold);
    const rivals = [owner, ...competitors]
      .filter((row) => row._id !== hold._id)
      .map((row) => row.websiteId);
    return { websiteId: hold.websiteId, locationCode: owner.locationCode ?? DEFAULT_LOCATION_CODE, rivals };
  },
});

export const rivalKeywords = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_site_volume", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
      .order("desc")
      .paginate({ cursor: args.cursor, numItems: PAGE });
    return {
      rows: result.page.map((row) => ({
        keyword: row.keyword,
        position: row.position,
        volume: row.volume,
        volumeKnown: row.volumeKnown,
        intent: row.intent,
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Which of these keywords the site currently ranks for. One point read each. */
export const keywordsSiteRanksFor = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), keywords: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const found = await Promise.all(args.keywords.slice(0, PAGE).map((keyword) =>
      ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("keyword", keyword))
        .unique()));
    return found.flatMap((row) => (row && row.position !== undefined ? [row.keyword] : []));
  },
});

export const writeGaps = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    rebuildId: v.string(),
    rows: v.array(v.object({
      keyword: v.string(),
      volume: v.number(),
      volumeKnown: v.boolean(),
      intent: rankIntentValidator,
      rivals: v.array(v.object({ websiteId: v.id("websites"), position: v.number() })),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("siteContentGaps")
        .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("keyword", row.keyword))
        .unique();
      const fields = {
        companyWebsiteId: args.companyWebsiteId,
        ...row,
        rivalsRanking: row.rivals.length,
        bestRivalPosition: Math.min(...row.rivals.map((rival) => rival.position)),
        rebuildId: args.rebuildId,
        updatedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("siteContentGaps", fields);
    }
    return null;
  },
});

export const removeStaleGaps = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), rebuildId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteContentGaps")
      .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .paginate({ cursor: args.cursor, numItems: WRITE_BATCH });
    for (const row of result.page) if (row.rebuildId !== args.rebuildId) await ctx.db.delete(row._id);
    return { cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Remove a hold's gap rows, when the hold goes. The caller loops until none are left. */
export const purgeHoldGaps = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("siteContentGaps")
      .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(WRITE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === WRITE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.siteContentGap.purgeHoldGaps, args);
      return true;
    }
    return false;
  },
});
