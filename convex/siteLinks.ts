import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";

/**
 * The site's link profile as its newest backlinks summary describes it: how
 * clean the links are, and where they come from — by country, by domain
 * ending and by the kind of site linking (docs/plans/active/user-sites-plan.md,
 * section 5, Link quality and Where links come from).
 *
 * One read: the newest `backlinks_summary` row for the website. The figures
 * over time come from the day summaries through `siteCharts.siteSeries`.
 */

const breakdownValidator = v.array(v.object({ key: v.string(), count: v.number() }));

/** A breakdown kept as `[["com", 120], …]` JSON text, as the parser wrote it. */
function readBreakdown(value: unknown): Array<{ key: string; count: number }> {
  if (typeof value !== "string") return [];
  try {
    const entries = JSON.parse(value) as unknown;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) =>
      Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number"
        ? [{ key: entry[0], count: entry[1] }]
        : []);
  } catch {
    return [];
  }
}

const numberOrNull = v.union(v.number(), v.null());

export const linkProfile = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    day: v.string(),
    backlinks: numberOrNull,
    referringDomains: numberOrNull,
    referringMainDomains: numberOrNull,
    domainRank: numberOrNull,
    brokenBacklinks: numberOrNull,
    brokenPages: numberOrNull,
    spamScore: numberOrNull,
    nofollowReferringDomains: numberOrNull,
    countries: breakdownValidator,
    tlds: breakdownValidator,
    platforms: breakdownValidator,
    linkTypes: breakdownValidator,
    attributes: breakdownValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const newest = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) =>
        q.eq("websiteId", site.website._id).eq("operationId", "backlinks_summary"))
      .order("desc")
      .first();
    if (!newest) return null;
    let figures: Record<string, unknown> = {};
    try {
      figures = JSON.parse(newest.metricsJson) as Record<string, unknown>;
    } catch {
      figures = {};
    }
    const number = (key: string) => (typeof figures[key] === "number" ? figures[key] as number : null);
    return {
      day: newest.day,
      backlinks: number("backlinks"),
      referringDomains: number("referringDomains"),
      referringMainDomains: number("referringMainDomains"),
      domainRank: number("rank"),
      brokenBacklinks: number("brokenBacklinks"),
      brokenPages: number("brokenPages"),
      spamScore: number("spamScore"),
      nofollowReferringDomains: number("nofollowReferringDomains"),
      countries: readBreakdown(figures.countriesJson),
      tlds: readBreakdown(figures.tldsJson),
      platforms: readBreakdown(figures.platformsJson),
      linkTypes: readBreakdown(figures.linkTypesJson),
      attributes: readBreakdown(figures.attributesJson),
    };
  },
});
