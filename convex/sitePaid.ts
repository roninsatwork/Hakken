import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireMySite } from "./siteAccess";
import { heldTo, listOrder, listPageArgs, listPageSeenResult, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { paidKeywordsSees } from "./utils/sees/paid";
import { tenantQuery } from "./tenantFunctions";
import { normaliseKeyword } from "./seoJudgments";
import { pagePath } from "./utils/siteShapes";
import { wordStartMatcher } from "./utils/wordStarts";

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
      // What DataForSEO did not say is left out, never written as 0.
      ...(row.searchVolume !== undefined ? { volume: row.searchVolume } : {}),
      ...(row.cpc !== undefined ? { cpc: row.cpc } : {}),
      ...(row.traffic !== undefined ? { traffic: row.traffic } : {}),
      ...(row.trafficCost !== undefined ? { trafficCost: row.trafficCost } : {}),
      searchText: `${keyword} ${page}`.trim(),
    });
  }
}

/**
 * Paid keywords' columns that sort (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, the advert's position from
 * the top, and the most searched, dearest click, most visits and highest cost
 * first.
 */
const PAID_SORTS: ListSorts<Doc<"sitePaidKeywords">, "keyword" | "position" | "volume" | "cpc" | "traffic" | "cost"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  cpc: { value: (row) => row.cpc, first: "desc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
  cost: { value: (row) => row.trafficCost, first: "desc" },
};

/**
 * The searches the site advertises on: most visits first unless a heading
 * asks otherwise. A list is one answer's worth, replaced whole when a newer
 * answer is filed, so it is read whole and its total is exact
 * (docs/plans/active/sites-table-pages-plan.md §5.1) — exact for what it
 * holds: the adverts among the everyday answer's hundred searches, which can
 * be far fewer than DataForSEO's own count of searches with adverts. The
 * screen says so (docs/plans/active/sites-audit-fixes-plan.md, 2.2).
 */
export const listPaidKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    sort: v.optional(v.union(
      v.literal("keyword"), v.literal("position"), v.literal("volume"), v.literal("cpc"), v.literal("traffic"), v.literal("cost"),
    )),
    direction: sortDirectionArg,
  },
  returns: listPageSeenResult(v.object({
    _id: v.id("sitePaidKeywords"),
    keyword: v.string(),
    position: v.union(v.number(), v.null()),
    url: v.union(v.string(), v.null()),
    page: v.string(),
    volume: v.union(v.number(), v.null()),
    cpc: v.union(v.number(), v.null()),
    traffic: v.union(v.number(), v.null()),
    trafficCost: v.union(v.number(), v.null()),
    day: v.string(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const read = await ctx.db
      .query("sitePaidKeywords")
      .withIndex("by_site_traffic", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place))
      .order("desc")
      .take(LIST_LIMIT + 1);
    const { rows: held, cut } = heldTo(read, LIST_LIMIT);
    const matches = wordStartMatcher(args.search);
    const list = held
      .filter((row) => !matches || matches(row.keyword, row.page))
      .sort(listOrder(PAID_SORTS, args.sort ?? "traffic", args.direction, (row) => row.keyword));
    const page = pageOfList(list, args.page, args.rows, cut);
    return {
      ...page,
      rows: page.rows.map((row) => ({
        _id: row._id,
        keyword: row.keyword,
        position: row.position ?? null,
        url: row.url ?? null,
        page: row.page,
        volume: row.volume ?? null,
        cpc: row.cpc ?? null,
        traffic: row.traffic ?? null,
        trafficCost: row.trafficCost ?? null,
        day: row.day,
      })),
      // What Hakken sees is of every search advertised on, whatever the search box holds.
      seen: paidKeywordsSees(held.map((row) => ({ keyword: row.keyword, traffic: row.traffic ?? null, trafficCost: row.trafficCost ?? null }))),
    };
  },
});
