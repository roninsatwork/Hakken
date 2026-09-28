import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { requireMySite } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";

/**
 * How many competitors DataForSEO found for a site, against the few it hands
 * back (sites-data-completeness-plan.md, B3): a discovery answer holds at
 * most 49 others, and the screens that list them — Organic competitors, the
 * Overview's "competitors found" — say "49 of N" rather than passing them off
 * as every website that ranks for the same searches.
 */

export const DISCOVERY_OPERATION_ID = "domain_competitors";

/** One discovery answer's figures: how many it held, and how many the supplier found. Replaces an earlier parse's. */
export const recordDiscoveryTotal = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    day: v.string(),
    locationCode: v.optional(v.number()),
    found: v.number(),
    total: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("seoWebsiteMetrics").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(10)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("seoWebsiteMetrics", {
      websiteId: args.websiteId,
      day: args.day,
      operationId: DISCOVERY_OPERATION_ID,
      pullId: args.pullId,
      metricsJson: JSON.stringify({ competitorsFound: args.found, ...(args.total !== null ? { competitorsTotal: args.total } : {}) }),
      ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
      createdAt: Date.now(),
    });
    return null;
  },
});

/** How many competitors the supplier found for a site from a place at its newest discovery; null before one said. */
export async function discoveredTotal(ctx: QueryCtx, websiteId: Id<"websites">, place: number): Promise<number | null> {
  const rows = await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) => q.eq("websiteId", websiteId).eq("operationId", DISCOVERY_OPERATION_ID))
    .order("desc")
    .take(10);
  for (const row of rows) {
    if (row.locationCode !== undefined && row.locationCode !== place) continue;
    const figures = JSON.parse(row.metricsJson) as { competitorsTotal?: number };
    if (typeof figures.competitorsTotal === "number") return figures.competitorsTotal;
  }
  return null;
}

/** How many websites rank for the same searches as the site, from its place: what Organic competitors' rows are "of". */
export const siteDiscoveryTotal = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await discoveredTotal(ctx, site.website._id, site.place);
  },
});

/**
 * How many searches the site and one of its competitors share, across
 * everything both rank for, as discovery counted them: the site's own
 * discovery first, then the competitor's. A competitor's page lists only the
 * searches in both kept lists, and says which part that is (§4.D3). Null when
 * neither discovery found the other.
 */
export const sharedWithRival = tenantQuery({
  args: { siteId: v.id("companyWebsites"), rivalId: v.id("companyWebsites") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // Only a hold of the same company: another company's discovery is its own.
    const rivalHold = await ctx.db.get(args.rivalId);
    if (!rivalHold || rivalHold.companyId !== site.hold.companyId) return null;
    const rivalSite = await ctx.db.get(rivalHold.websiteId);
    if (!rivalSite) return null;
    const mine = await ctx.db
      .query("discoveredCompetitors")
      .withIndex("by_company_website_host", (q) => q.eq("companyWebsiteId", args.siteId).eq("host", rivalSite.host))
      .first();
    if (mine) return mine.intersections;
    const theirs = await ctx.db
      .query("discoveredCompetitors")
      .withIndex("by_company_website_host", (q) => q.eq("companyWebsiteId", args.rivalId).eq("host", site.website.host))
      .first();
    return theirs?.intersections ?? null;
  },
});
