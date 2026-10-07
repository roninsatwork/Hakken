import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import { pairedOwnedHold } from "./utils/websitePairing";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { newestLinesOfWebsite } from "./positionHistory";

/**
 * What one of a company's websites ranks for.
 *
 * The data has been collected since the pipeline shipped and has never been on
 * a screen. It is read through the company's own hold on the website, like
 * every other tenant-facing read here, so nothing starts from the shared
 * record and walks outward.
 *
 * The intent beside each search comes from `seo.keyword-intent`, judged once
 * per phrase and shared across every client in the same trade. Absent means
 * nobody has judged it yet, which the screen says rather than guessing.
 *
 * **Read from this watcher's place.** The same host ranks differently in Leeds
 * and in London, and a check made for another client watching from elsewhere
 * is filed on the same website — so without this, one client's list would mix
 * in another's town. A paired tracked site reads from its pair's place, which
 * is where it was checked.
 */
export const listWebsiteKeywords = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("keywordPositionMonths"),
      keyword: v.string(),
      position: v.union(v.number(), v.null()),
      searchVolume: v.union(v.number(), v.null()),
      day: v.string(),
      intent: v.union(v.string(), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    const pair = await pairedOwnedHold(ctx, companyWebsite);
    const place = (pair ?? companyWebsite).locationCode ?? DEFAULT_LOCATION_CODE;

    // Through the place index, not filtered after the read: a take followed
    // by a filter reads the newest rows from every place and keeps this one's,
    // so a busier town's rows would push this watcher's out of the window.
    const lines = await newestLinesOfWebsite(ctx, { websiteId: companyWebsite.websiteId, locationCode: place }, MAX_KEYWORDS);

    // One row per search: the newest day wins, because a chart of one phrase
    // over time is a different screen from a list of what a site ranks for.
    // Its newest month is read first, and that month's last point is its newest.
    const newest = new Map<string, { _id: (typeof lines)[number]["_id"]; keyword: string; day: string; position: number | null }>();
    for (const line of lines) {
      const key = line.keyword.toLowerCase();
      const last = line.points.at(-1);
      if (!last || newest.has(key)) continue;
      newest.set(key, { _id: line._id, keyword: line.keyword, day: last.day, position: last.position });
    }

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = [...newest.values()]
      .filter((row) => !term || includesSearchTerm(row.keyword, term))
      // Best position first: what a site actually ranks well for is the thing
      // somebody opens this screen to see.
      .sort((left, right) => (left.position ?? 999) - (right.position ?? 999));

    const paged = paginateItems(matching, args.page, args.pageSize);

    const withIntent = await Promise.all(paged.data.map(async (row) => {
      const normalised = row.keyword.trim().replace(/\s+/g, " ").toLowerCase();
      const intent = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", normalised))
        .unique();
      // Its searches a month, from the site's latest ranking of it: a point keeps no volume.
      const ranked = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) => q.eq("websiteId", companyWebsite.websiteId).eq("locationCode", place).eq("keyword", normalised))
        .unique();
      return {
        _id: row._id,
        keyword: row.keyword,
        position: row.position,
        searchVolume: ranked?.volumeKnown ? ranked.volume : null,
        day: row.day,
        intent: intent?.intent ?? null,
      };
    }));

    return { ...paged, data: withIntent };
  },
});

/** Searches' months read per screen. A large site has more; this is a list, not an export. */
const MAX_KEYWORDS = 2_000;
