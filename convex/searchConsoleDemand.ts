import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { checkedCountry } from "./searchConsoleCountries";
import { readPeriod } from "./searchConsolePeriodReads";
import { classifyPages, readClassificationSetup } from "./pageClassifications";
import { pagePath } from "./utils/siteShapes";

/** The pages read to name and sort a website's pages: its pages, most clicks first. */
const PAGES_READ = 900;

const serviceRow = v.object({
  /** A classification's id; a service page's path; GUIDES; or OTHER. */
  id: v.string(),
  /** The classification's name or the service page's title; none for the guides and the rest, which the screen words. */
  name: v.union(v.string(), v.null()),
  kind: v.union(v.literal("CLASSIFICATION"), v.literal("SERVICE"), v.literal("GUIDES"), v.literal("OTHER")),
  shown: v.number(),
  shownBefore: v.union(v.number(), v.null()),
  clicks: v.number(),
  clicksBefore: v.union(v.number(), v.null()),
  pages: v.number(),
});

/**
 * Demand by service (docs/plans/active/insights-analyst-plan.md §4.4, phase 9,
 * drawn as the ScDemand board): how often Google showed the website for each
 * of its services in the dates chosen against the same days before, and what
 * buyers clicked — Search Console's own page list, each service page on its
 * own (a classification of service pages split into its services), then the
 * company's other page classifications; until it has any, Hakken's kinds of
 * page: each service page, the guides together, and the rest. Ready-made
 * periods only, for the main home country or a country kept ready.
 */
export const searchConsoleDemand = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    period: v.union(v.literal("7"), v.literal("30"), v.literal("90"), v.literal("365")),
    country: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.object({
    from: v.string(),
    to: v.string(),
    beforeFrom: v.union(v.string(), v.null()),
    beforeTo: v.union(v.string(), v.null()),
    classified: v.boolean(),
    services: v.array(serviceRow),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId: Id<"companyWebsites"> = site.hold._id;
    const country = checkedCountry(args.country);
    const now = await readPeriod(ctx, holdId, "web", "page", args.period, "NOW", country);
    if (!now) return null;
    const before = await readPeriod(ctx, holdId, "web", "page", args.period, "BEFORE", country);
    const held = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", holdId)).order("desc").take(PAGES_READ);
    const byPath = new Map<string, Doc<"holdPages">>(held.map((page) => [page.page, page]));
    const setup = await readClassificationSetup(ctx, holdId);
    const classified = setup.classifications.length > 0;
    const names = new Map<string, string>(setup.classifications.map((classification) => [classification._id, classification.name]));
    // A classification of service pages is split into its services, a page each: "by service" means each one.
    const services = new Set<string>(setup.classifications.filter((classification) => classification.type === "SERVICE").map((classification) => classification._id));
    const paths = [...new Set([...now.rows, ...(before?.rows ?? [])].map((row) => pagePath(row.key)))];
    const sortedPages = classified
      ? new Map(classifyPages(setup, paths.map((path) => ({ page: path, clicks: 0, sitemapFile: byPath.get(path)?.sitemapFile }))).map((entry) => [entry.page, entry.result.classificationId]))
      : null;
    // Each page's service: its own page when it is one, its classification, the guides, or the rest.
    const serviceOf = (path: string): { id: string; name: string | null; kind: "CLASSIFICATION" | "SERVICE" | "GUIDES" | "OTHER" } => {
      const page = byPath.get(path);
      if (sortedPages) {
        const id = sortedPages.get(path) ?? null;
        if (id && services.has(id)) return { id: path, name: page?.title ?? null, kind: "SERVICE" };
        return id ? { id, name: names.get(id) ?? null, kind: "CLASSIFICATION" } : { id: "OTHER", name: null, kind: "OTHER" };
      }
      if (page?.pageType === "SERVICE" || page?.pageType === "HOME" || path === "/") return { id: path, name: page?.title ?? null, kind: "SERVICE" };
      if (page?.pageType === "ARTICLE") return { id: "GUIDES", name: null, kind: "GUIDES" };
      return { id: "OTHER", name: null, kind: "OTHER" };
    };
    const rows = new Map<string, typeof serviceRow.type>();
    const add = (key: string, shown: number, clicks: number, which: "now" | "before") => {
      const service = serviceOf(pagePath(key));
      const entry = rows.get(service.id) ?? { ...service, shown: 0, shownBefore: before ? 0 : null, clicks: 0, clicksBefore: before ? 0 : null, pages: 0 };
      if (which === "now") {
        entry.shown += shown;
        entry.clicks += clicks;
        entry.pages += 1;
      } else {
        entry.shownBefore = (entry.shownBefore ?? 0) + shown;
        entry.clicksBefore = (entry.clicksBefore ?? 0) + clicks;
      }
      rows.set(service.id, entry);
    };
    for (const row of now.rows) add(row.key, row.impressions, row.clicks, "now");
    for (const row of before?.rows ?? []) add(row.key, row.impressions, row.clicks, "before");
    return {
      from: now.from,
      to: now.to,
      beforeFrom: before?.from ?? null,
      beforeTo: before?.to ?? null,
      classified,
      services: [...rows.values()].sort((a, b) => b.shown - a.shown),
    };
  },
});
