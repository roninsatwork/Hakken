import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { connectionOf, readFor } from "./googleAnalyticsRows";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { SHOP_PAGES_KIND, isShopPage } from "./utils/shopPages";

/**
 * "What people looked at, by kind of page" on Visits (docs/plans/active/visits-redo-plan-2026-11-03.md, step 1;
 * Anthony, 2026-11-03: "this is pages visited by type not where they start"): every page's views for the dates chosen,
 * added up by the website's page groups, the way every screen sorts a page (`readPageKinds`), the pages in none as Not
 * sorted. Views, never visits: one visit sees many pages of a kind, so visits added up would count it again for each.
 *
 * Worked out as it is read from the page list each collection already keeps, so nothing new is kept and nothing asked
 * of Google; the plan's first thought, adding them up at collection, would have shown nothing until the next run and
 * gone stale whenever the pages were sorted again. Measured on morehandles.co.uk's 9,538 pages (3 November 2026) inside
 * Convex's second. Only the caller's own website (`requireMySite`).
 */

const pageKindViewsArgs = {
  siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()),
  /** All pages: each kind against the span before, with the shop's search, basket and account pages as one of their own. */
  against: v.optional(v.boolean()),
  /** Live: the shop's search, basket and account pages as one of their own, with no span before to read. */
  shopApart: v.optional(v.boolean()),
};

export const analyticsPageKindViews = tenantQuery({
  args: pageKindViewsArgs,
  returns: v.union(v.null(), v.object({
    /** One device's page list not built yet: the next collection builds it. */
    waiting: v.boolean(),
    /** False while the website has no page groups: there is nothing to add the views up by. */
    sorted: v.boolean(),
    /** Each page group with views, most first; Not sorted (`NOT_SORTED`) among them, named by the screen. */
    kinds: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()), views: v.number(), pages: v.number(), viewsBefore: v.optional(v.number()) })),
    views: v.number(),
    /** Views Google gave no page for, or folded into its own "(other)" row: on no kind of page. */
    unplaced: v.number(),
  })),
  handler: async (ctx, args) => await readPageKindViews(ctx, args),
});

export async function readPageKindViews(ctx: SiteReader, args: { siteId: (typeof pageKindViewsArgs)["siteId"]["type"]; period: AnalyticsPeriod; device: string; shopApart?: boolean; country?: string; against?: boolean }) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const list = await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country);
  if (list === "LIVE") return { waiting: true, sorted: false, kinds: [], views: 0, unplaced: 0 };
  if (!list) return null;
  const kinds = await readPageKinds(ctx, holdId);
  const rows = list.rows.filter((row) => row.views > 0);
  const addresses = await decodePages(ctx, holdId, rows.map((row) => row.key));
  const by = new Map<string, { views: number; pages: number; viewsBefore: number }>();
  const kindFor = (address: string) => ((args.against || args.shopApart) && isShopPage(address) ? SHOP_PAGES_KIND : kinds ? kinds.kindOf(address) : NOT_SORTED_KIND);
  let unplaced = 0;
  rows.forEach((row, at) => {
    const address = addresses[at];
    // A number Hakken can't read back, Google's "(not set)" or its "(other)": no page to sort. An address or a path
    // sorts as itself (`normalisePage` reads either).
    if (isPageRef(address) || !(/^https?:\/\//.test(address) || address.startsWith("/"))) {
      unplaced += row.views;
      return;
    }
    const kind = kindFor(address);
    const one = by.get(kind) ?? { views: 0, pages: 0, viewsBefore: 0 };
    one.views += row.views;
    one.pages += 1;
    by.set(kind, one);
  });
  if (args.against) {
    const before = await readFor(ctx, holdId, "page", args.period, "BEFORE", args.device, undefined, country);
    const earlier = before && before !== "LIVE" ? before.rows.filter((row) => row.views > 0) : [];
    const was = await decodePages(ctx, holdId, earlier.map((row) => row.key));
    earlier.forEach((row, at) => {
      const address = was[at];
      if (isPageRef(address) || !(/^https?:\/\//.test(address) || address.startsWith("/"))) return;
      const kind = kindFor(address);
      const one = by.get(kind) ?? { views: 0, pages: 0, viewsBefore: 0 };
      one.viewsBefore += row.views;
      by.set(kind, one);
    });
  }
  return {
    waiting: false,
    sorted: kinds !== null,
    kinds: [...by.entries()]
      .map(([kind, one]) => ({ kind, name: kinds?.nameOf(kind) ?? null, views: one.views, pages: one.pages, ...(args.against ? { viewsBefore: one.viewsBefore } : {}) }))
      .sort((left, right) => right.views - left.views),
    views: rows.reduce((sum, row) => sum + row.views, 0),
    unplaced,
  };
}
