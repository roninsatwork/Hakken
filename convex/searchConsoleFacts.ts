import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadSite } from "./websiteSiteRows";
import { holdBrandNames } from "./holdProfiles";
import { normaliseKeyword } from "./seoJudgments";
import { searchVolumeOf } from "./searchVolumes";
import { pagePath, pageTypeByAddress } from "./utils/siteShapes";

/**
 * What Sites already knows about the keywords and pages Search Console
 * lists (docs/plans/active/search-console-plan.md §13.3, §14.3 item 4): a
 * keyword's intent and the searches a month behind it, a page's type and the
 * visits Sites estimates for it. Looked up once after each collection and
 * kept with the ready-made periods, so no screen looks anything up a row at
 * a time.
 *
 * Every figure is Sites' own, read from the website's place. A keyword
 * Sites has never seen is "Not judged yet" with no monthly searches; a page,
 * its type by its address where the address says so, else "Not sorted yet".
 * Judging what is left is the Decision Maker's, and costs: not done here
 * (§13.4).
 */

/** Keys looked up per ask: each is one or two index reads. */
const KEYS_PER_ASK = 200;

/** Unknown, as a number kept beside the others (a period's arrays hold numbers only). */
export const UNKNOWN = -1;

/** The website, the place Sites watches it from and its brand words (its Profile), for the hold's lookups. */
export const factsTarget = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ websiteId: v.id("websites"), place: v.number(), brandWords: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.companyWebsiteId);
    if (!site) return null;
    const brandWords = (await holdBrandNames(ctx, args.companyWebsiteId)).map((brand) => brand.name);
    return { websiteId: site.website._id, place: site.place, brandWords };
  },
});

/**
 * Each key's facts, in the order given: for a keyword its intent and
 * monthly searches; for a page its type and Sites' estimated visits a month.
 */
export const keyFacts = internalQuery({
  args: {
    websiteId: v.id("websites"),
    place: v.number(),
    kind: v.union(v.literal("query"), v.literal("page")),
    keys: v.array(v.string()),
  },
  returns: v.object({ kinds: v.array(v.string()), numbers: v.array(v.number()) }),
  handler: async (ctx, args) => {
    const kinds: string[] = [];
    const numbers: number[] = [];
    for (const key of args.keys) {
      if (args.kind === "query") {
        const keyword = normaliseKeyword(key);
        const ranked = await ctx.db
          .query("siteKeywordRanks")
          .withIndex("by_site_keyword", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place).eq("keyword", keyword))
          .unique();
        const judged = ranked ? null : await ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", keyword)).unique();
        const measured = ranked?.volumeKnown ? null : await searchVolumeOf(ctx, keyword, args.place);
        kinds.push(ranked?.intent ?? judged?.intent ?? "UNJUDGED");
        numbers.push(ranked?.volumeKnown ? ranked.volume : (measured?.volume ?? UNKNOWN));
      } else {
        const path = pagePath(key);
        const ranked = await ctx.db
          .query("sitePageRanks")
          .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place).eq("page", path))
          .unique();
        const byAddress = pageTypeByAddress(path);
        const judged = byAddress ? null : await ctx.db
          .query("sitePageTypes")
          .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("page", path))
          .unique();
        kinds.push(byAddress ?? judged?.pageType ?? ranked?.pageType ?? "UNJUDGED");
        numbers.push(ranked?.traffic ?? UNKNOWN);
      }
    }
    return { kinds, numbers };
  },
});

export type Facts = Map<string, { kind: string; number: number }>;

/** The facts for every key, asked a few hundred at a time. */
export async function factsFor(
  ctx: ActionCtx,
  target: { websiteId: Id<"websites">; place: number },
  kind: "query" | "page",
  keys: readonly string[],
): Promise<Facts> {
  const facts: Facts = new Map();
  for (let start = 0; start < keys.length; start += KEYS_PER_ASK) {
    const slice = keys.slice(start, start + KEYS_PER_ASK);
    const found = await ctx.runQuery(internal.searchConsoleFacts.keyFacts, { websiteId: target.websiteId, place: target.place, kind, keys: slice });
    slice.forEach((key, index) => facts.set(key, { kind: found.kinds[index] ?? "UNJUDGED", number: found.numbers[index] ?? UNKNOWN }));
  }
  return facts;
}
