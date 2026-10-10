import { v } from "convex/values";
import { seenValidator } from "./utils/hakkenSees";
import { overviewGapsSees } from "./utils/sees/radar";
import { tenantQuery } from "./tenantFunctions";
import { listHold, listWebsiteId, requireMySite } from "./siteAccess";
import { holdSearches } from "./holdLists";
import { searchVolumeOf } from "./searchVolumes";
import { MAX_LIST, type Site } from "./websiteSiteRows";
import type { QueryCtx } from "./_generated/server";

type Reader = { db: QueryCtx["db"] };

/**
 * Discovery → Brand radar → AI Overview gaps (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 3, D18; drawn as "Brand radar · AI
 * Overview gaps"): the website's tracked searches where Google shows an AI
 * Overview, whether it quotes the website, who it quotes instead, and the
 * website's own page for the search — read from the Google checks already
 * bought, each in small (`serpOverviews`), so it costs nothing more.
 */
const DAY_MS = 86_400_000;

export const overviewGaps = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    searches: v.number(),
    quotedBefore: v.union(v.number(), v.null()),
    rows: v.array(v.object({
      keyword: v.string(),
      volume: v.union(v.number(), v.null()),
      position: v.union(v.number(), v.null()),
      overview: v.boolean(),
      quotesYou: v.boolean(),
      /** The websites it quotes, this one first where quoted: the first few. */
      quotes: v.array(v.string()),
      yourPage: v.union(v.string(), v.null()),
    })),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const result = await readOverviews(ctx, await requireMySite(ctx, args.siteId));
    return { ...result, seen: overviewGapsSees(result) };
  },
});

/** Each tracked search's AI Overview from its newest check, and how many quoted the website a month before: the page's rows, and Your assets'. */
export async function readOverviews(ctx: Reader, site: Site) {
  const host = site.website.host;
  const websiteId = listWebsiteId(site);
  const searches = await holdSearches(ctx, listHold(site), MAX_LIST, { activeOnly: true });
  const isHost = (domain: string) => {
    const name = domain.toLowerCase().replace(/^www\./, "");
    return name === host || name.endsWith(`.${host}`);
  };
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
  let quotedBefore: number | null = null;
  const rows = [];
  for (const search of searches) {
    const [page, before, rank] = await Promise.all([
      ctx.db.query("serpOverviews").withIndex("by_keyword_place_day", (q) => q.eq("keyword", search.keyword).eq("locationCode", site.place)).order("desc").first(),
      ctx.db.query("serpOverviews").withIndex("by_keyword_place_day", (q) => q.eq("keyword", search.keyword).eq("locationCode", site.place).lte("day", monthAgo)).order("desc").first(),
      ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place).eq("keyword", search.keyword)).first(),
    ]);
    if (before) quotedBefore = (quotedBefore ?? 0) + (before.domains.some(isHost) ? 1 : 0);
    if (!page) continue;
    const yourPage = rank?.page || null;
    const volume = rank?.volumeKnown ? rank.volume : (await searchVolumeOf(ctx, search.keyword, site.place))?.volume ?? null;
    rows.push({
      keyword: search.keyword,
      volume,
      position: rank?.position ?? null,
      overview: page.overview,
      quotesYou: page.domains.some(isHost),
      // The websites it quotes, this one first where it is among them, as drawn.
      quotes: [...new Set(page.domains.map((domain) => domain.replace(/^www\./, "")))].sort((left, right) => Number(isHost(right)) - Number(isHost(left))).slice(0, 3),
      yourPage: yourPage || null,
    });
  }
  return { searches: rows.length, quotedBefore, rows };
}
