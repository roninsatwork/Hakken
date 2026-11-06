import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { SHOP_PAGES_KIND, isShopPage, isShopTitle } from "./utils/shopPages";
import { livePageValidator, type LivePage } from "./utils/liveFigures";

/**
 * What Hakken has saved about the pages Google's live figures name (live-new-page-plan-2026-11-06.md, step 1). Google gives Live a
 * title and nothing else, so a page's address and Classification are found by its title in the website's one page list, by index.
 * Saved figures only, read once for each answer from Google, never on a screen's own subscription.
 */

/** Pages read for one title. A title on more than this many pages takes the busiest of these: it's a guide either way. */
const PAGES_OF_A_TITLE = 25;

export const livePagesOf = internalQuery({
  args: { holdId: v.id("companyWebsites"), titles: v.array(v.string()) },
  returns: v.object({ sorted: v.boolean(), pages: v.array(livePageValidator) }),
  handler: async (ctx, args) => {
    const addresses = new Map<string, string>();
    for (const title of new Set(args.titles)) {
      const rows = await ctx.db
        .query("holdPages")
        .withIndex("by_hold_title", (q) => q.eq("companyWebsiteId", args.holdId).eq("title", title))
        .take(PAGES_OF_A_TITLE);
      const busiest = rows.reduce<(typeof rows)[number] | null>((best, row) => (
        !best || (row.visits ?? 0) + row.clicks > (best.visits ?? 0) + best.clicks ? row : best
      ), null);
      if (busiest) addresses.set(title, busiest.page);
    }
    const kinds = await readPageKinds(ctx, args.holdId, { pages: [...addresses.values()] });
    const pages: LivePage[] = [...new Set(args.titles)].map((title) => {
      const address = addresses.get(title) ?? null;
      const kind = address !== null
        ? (isShopPage(address) ? SHOP_PAGES_KIND : kinds ? kinds.kindOf(address) : NOT_SORTED_KIND)
        : (isShopTitle(title) ? SHOP_PAGES_KIND : NOT_SORTED_KIND);
      return { title, address, kind, kindName: kinds?.nameOf(kind) ?? null };
    });
    return { sorted: kinds !== null, pages };
  },
});
