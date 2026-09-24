import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireMySite, sitePage } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { normaliseKeyword } from "./seoJudgments";
import { pagePath } from "./utils/siteShapes";

/**
 * Paid search for the Sites screens (docs/plans/active/user-sites-plan.md,
 * Phase 5): the searches a website buys Google adverts on, and what they might
 * cost — read from the ranked-keywords answer we already buy, which carries
 * adverts beside organic results. No call is bought for it.
 */

/** Rows one filing clears before it writes: a list is at most a pull's worth. */
const LIST_LIMIT = 1_100;

export const paidPositionValidator = v.object({
  keyword: v.string(),
  position: v.optional(v.number()),
  url: v.optional(v.string()),
  searchVolume: v.optional(v.number()),
  cpc: v.optional(v.number()),
  traffic: v.optional(v.number()),
  trafficCost: v.optional(v.number()),
});

/** A site's newest ranked-keywords totals read to find this place's newest answer. */
const NEWEST_ANSWERS_READ = 50;

/**
 * Replace a website's paid-search list with this answer's, unless a newer
 * answer has already been filed — a re-parse of an old pull must not bring
 * back adverts the site has since stopped.
 */
export async function filePaidKeywords(
  ctx: MutationCtx,
  entry: {
    websiteId: Id<"websites">;
    locationCode: number;
    pullId: Id<"seoDataPulls">;
    day: string;
    rows: ReadonlyArray<{ keyword: string; position?: number; url?: string; searchVolume?: number; cpc?: number; traffic?: number; trafficCost?: number }>;
  },
): Promise<void> {
  // The newest ranked-keywords answer from this place decides — including one
  // that carried no adverts, which leaves no paid rows to compare days with.
  const newest = (await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) =>
      q.eq("websiteId", entry.websiteId).eq("operationId", "domain_ranked_keywords"))
    .order("desc")
    .take(NEWEST_ANSWERS_READ))
    .find((row) => row.locationCode === undefined || row.locationCode === entry.locationCode);
  if (newest && newest.day > entry.day) return;
  const held = await ctx.db
    .query("sitePaidKeywords")
    .withIndex("by_site_traffic", (q) => q.eq("websiteId", entry.websiteId).eq("locationCode", entry.locationCode))
    .take(LIST_LIMIT);
  if (held.some((row) => row.day > entry.day)) return;
  for (const row of held) await ctx.db.delete(row._id);
  for (const row of entry.rows) {
    const keyword = normaliseKeyword(row.keyword);
    if (!keyword) continue;
    const page = pagePath(row.url);
    await ctx.db.insert("sitePaidKeywords", {
      websiteId: entry.websiteId,
      locationCode: entry.locationCode,
      pullId: entry.pullId,
      day: entry.day,
      keyword,
      ...(row.position !== undefined ? { position: row.position } : {}),
      ...(row.url ? { url: row.url } : {}),
      page,
      volume: row.searchVolume ?? 0,
      ...(row.cpc !== undefined ? { cpc: row.cpc } : {}),
      traffic: row.traffic ?? 0,
      trafficCost: row.trafficCost ?? 0,
      searchText: `${keyword} ${page}`.trim(),
    });
  }
}

/** The searches the site advertises on: most visits, dearest or most searched first. */
export const listPaidKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("traffic"), v.literal("cost"), v.literal("volume"))),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("sitePaidKeywords"),
    keyword: v.string(),
    position: v.union(v.number(), v.null()),
    url: v.union(v.string(), v.null()),
    page: v.string(),
    volume: v.number(),
    cpc: v.union(v.number(), v.null()),
    traffic: v.number(),
    trafficCost: v.number(),
    day: v.string(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;
    const term = args.search?.trim();
    const index = args.sort === "cost" ? "by_site_cost" : args.sort === "volume" ? "by_site_volume" : "by_site_traffic";
    const result = term
      ? await ctx.db
        .query("sitePaidKeywords")
        .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("websiteId", websiteId).eq("locationCode", place))
        .paginate(sitePage(args.paginationOpts))
      : await ctx.db
        .query("sitePaidKeywords")
        .withIndex(index, (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
        .order("desc")
        .paginate(sitePage(args.paginationOpts));
    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id,
        keyword: row.keyword,
        position: row.position ?? null,
        url: row.url ?? null,
        page: row.page,
        volume: row.volume,
        cpc: row.cpc ?? null,
        traffic: row.traffic,
        trafficCost: row.trafficCost,
        day: row.day,
      })),
    };
  },
});
