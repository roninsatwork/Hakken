import { v } from "convex/values";
import { seeing, seenValidator } from "./utils/hakkenSees";
import { demandSees } from "./sees/aiAnswers";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { groupOwner, requireMySite } from "./siteAccess";
import { aiVolumeOf, demandSearches } from "./aiDemand";
import { searchVolumeOf } from "./searchVolumes";
import { trendOf } from "./utils/rankFacts";
import { unpackColumn } from "./utils/packedColumns";

/**
 * Discovery → AI answers → AI demand (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 3, D18; drawn as "AI answers · AI demand"):
 * each of the website's searches — tracked, from the AI's own searches, or
 * among its biggest keywords — with how often it is asked of AI tools a
 * month beside how often it is searched on Google, both over a year.
 */
export const aiDemand = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    /** The newest month the AI figures are for, "2026-09"; null before any is bought. */
    month: v.union(v.string(), v.null()),
    rows: v.array(v.object({
      keyword: v.string(),
      from: v.union(v.literal("SEARCH"), v.literal("FAN_OUT"), v.literal("KEYWORD")),
      ai: v.union(v.number(), v.null()),
      /** The last twelve months, oldest first: empty before it is bought. */
      aiMonths: v.array(v.number()),
      google: v.union(v.number(), v.null()),
      googleMonths: v.array(v.number()),
    })),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites"> }) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = groupOwner(site);
    if (!hold) return { month: null, rows: [] };
    let month: string | null = null;
    const rows = [];
    for (const { keyword, from } of await demandSearches(ctx, hold)) {
      const [ai, rank, measured] = await Promise.all([
        aiVolumeOf(ctx, keyword, site.place),
        ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", site.place).eq("keyword", keyword)).first(),
        searchVolumeOf(ctx, keyword, site.place),
      ]);
      if (ai?.month && (!month || ai.month > month)) month = ai.month;
      const googleMonths = rank?.trend !== undefined ? trendOf(rank.trend) : measured?.trend ?? [];
      rows.push({
        keyword,
        from,
        ai: ai?.volume ?? null,
        aiMonths: ai ? unpackColumn(ai.months).map((value) => value ?? 0) : [],
        google: rank?.volumeKnown ? rank.volume : measured?.volume ?? null,
        googleMonths,
      });
    }
    return { month, rows };
  }, demandSees),
});
