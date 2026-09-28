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
    /** The servers, networks and pages linking here in all: what the lists kept are of (§4.G). */
    referringIps: numberOrNull,
    referringSubnets: numberOrNull,
    referringPages: numberOrNull,
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
      referringIps: number("referringIps"),
      referringSubnets: number("referringSubnets"),
      referringPages: number("referringPages"),
      countries: readBreakdown(figures.countriesJson),
      tlds: readBreakdown(figures.tldsJson),
      platforms: readBreakdown(figures.platformsJson),
      linkTypes: readBreakdown(figures.linkTypesJson),
      attributes: readBreakdown(figures.attributesJson),
    };
  },
});

/** The lists whose totals the screens say, by the request that buys each. */
const LIST_TOTALS = {
  referringDomains: "referring_domains_list",
  backlinks: "backlinks_all",
  oneEach: "backlinks_list",
  broken: "backlinks_broken",
  anchors: "anchors_list",
  ips: "referring_ips_list",
} as const;

/** A list's newest pages read for its total: ten at most a list, from a few runs. */
const LIST_PAGES_READ = 30;

/**
 * How long each link list is in all, as the supplier counted it when the
 * newest list was bought — what the rows kept are "of" (sites-data-completeness-plan.md,
 * §4.E and §4.G). Null for a list bought before its total was kept.
 */
export const linkListTotals = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object(Object.fromEntries(Object.keys(LIST_TOTALS).map((key) => [key, numberOrNull])) as Record<keyof typeof LIST_TOTALS, typeof numberOrNull>),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const totals = {} as Record<keyof typeof LIST_TOTALS, number | null>;
    for (const [key, operationId] of Object.entries(LIST_TOTALS) as Array<[keyof typeof LIST_TOTALS, string]>) {
      const pages = await ctx.db
        .query("seoWebsiteMetrics")
        .withIndex("by_website_operation_day", (q) => q.eq("websiteId", site.website._id).eq("operationId", operationId))
        .order("desc")
        .take(LIST_PAGES_READ);
      const newest = pages[0]?.day;
      let total: number | null = null;
      for (const page of pages) {
        if (page.day !== newest) break;
        try {
          const figures = JSON.parse(page.metricsJson) as { listTotal?: unknown };
          if (typeof figures.listTotal === "number") total = Math.max(total ?? 0, figures.listTotal);
        } catch {
          // A page whose figures cannot be read says nothing of the total.
        }
      }
      totals[key] = total;
    }
    return totals;
  },
});
