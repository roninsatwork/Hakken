import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { searchTypeValidator } from "./searchConsoleSchema";
import { checkedRange } from "./searchConsoleReads";
import { answerFacts, brandSplitValidator, readList } from "./searchConsoleLists";
import { namedRows } from "./searchConsolePeriodBooks";
import { TOP_KEYWORDS } from "./utils/searchConsoleViews";
import { calendarPeriodValidator } from "./utils/calendarPeriods";

const topKeywordValidator = v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), position: v.number(), brand: v.boolean() });

/**
 * The keywords Google showed the website for most, for Performance's dots, and the list's split of brand searches
 * from the rest, for its squares (search-console-performance-way-3-plan-2026-11-17.md): one read of the ready-made
 * keyword list, as the Keywords screen reads it (`readList`), with only the top `TOP_KEYWORDS` named and sent. `live`
 * for other dates and a country not kept ready: the page then asks Google for the list (`searchConsoleLiveList`).
 */
export const searchConsoleTopKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    from: v.string(),
    to: v.string(),
    period: v.optional(calendarPeriodValidator),
    country: v.optional(v.string()),
  },
  returns: v.object({
    rows: v.array(topKeywordValidator),
    brand: v.union(v.null(), v.object({ now: brandSplitValidator, before: v.union(brandSplitValidator, v.null()) })),
    preparing: v.boolean(),
    noSearches: v.optional(v.boolean()),
    ...answerFacts,
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const list = await readList(ctx, site.hold._id, { ...args, dimension: "query", sort: "impressions", direction: "desc" });
    const named = await namedRows(list, list.rows.slice(0, TOP_KEYWORDS));
    return {
      rows: named.map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position, brand: row.brand === true })),
      brand: list.summary?.brand ?? null,
      preparing: list.preparing,
      ...(list.noSearches ? { noSearches: true } : {}),
      current: true,
      named: list.named,
      listed: list.listed,
      comparable: list.comparable,
      live: list.live,
      from: list.from,
      to: list.to,
    };
  },
});
