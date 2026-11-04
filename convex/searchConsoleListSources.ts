import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { holdBrandNames } from "./holdProfiles";
import { trackedKeys } from "./searchConsoleTracking";
import type { SitesKeyword } from "./utils/searchConsoleViews";
import { loadSite } from "./websiteSiteRows";

/**
 * What a Search Console list reads beside its own rows (`searchConsoleLists.ts`): the website's connection, the
 * company's tracked searches and pages, its brand words and its most-searched keywords in Sites. Their own module since
 * 2026-11-03, to keep the lists inside the backend's size.
 */

export async function connectionOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

/** The company's tracked searches or pages on this website, read by its hold. */
export async function trackedOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, kind: "query" | "page"): Promise<Set<string>> {
  return new Set(await trackedKeys(ctx, companyWebsiteId, kind));
}

/** The website's brand words, from its Profile: names and misspellings alike. */
export async function brandWordsOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<string[]> {
  return (await holdBrandNames(ctx, companyWebsiteId)).map((brand) => brand.name);
}

/** The website's most-searched keywords in Sites, for Missed demand: as many as its limit (`consoleMissedKeywords`). */
export async function sitesKeywordsOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, most: number): Promise<SitesKeyword[]> {
  const site = await loadSite(ctx, companyWebsiteId);
  if (!site) return [];
  const rows = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_volume", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place))
    .order("desc")
    .take(most);
  return rows.filter((row) => row.volumeKnown).map((row) => ({ keyword: row.keyword, volume: row.volume, kind: row.intent }));
}
