import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalisePage } from "./utils/pageClassification";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";

/**
 * A website's page titles, read where they are kept once — the website's one
 * page list (`holdPages.title`, docs/plans/active/google-analytics-plan.md
 * GA27, §18.6.3) — for the pages a screen shows: one indexed read a page,
 * only for the rows on screen. Google Analytics' and Search Console's page
 * lists all read them here, so a page has one title everywhere.
 */
export async function titlesOf(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  addresses: readonly string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const address of new Set(addresses)) {
    // An address or a path; never "(not set)", a page number or a blank.
    if (!/^https?:\/\//i.test(address) && !address.startsWith("/")) continue;
    const row = await ctx.db
      .query("holdPages")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", normalisePage(address)))
      .first();
    if (row?.title) titles.set(address, row.title);
  }
  return titles;
}

/** One page's title, for its own screen's header: Search Console's page screen. Only the caller's own website. */
export const pageTitle = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return (await titlesOf(ctx, site.hold._id, [args.page])).get(args.page) ?? null;
  },
});

/** Rows with their pages' titles where the website's page list has one: only the rows given, the ones a screen shows. */
export async function withTitles<Row extends { key: string }>(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  rows: readonly Row[],
  addressOf: (row: Row) => string = (row) => row.key,
): Promise<Array<Row & { title?: string }>> {
  const titles = await titlesOf(ctx, holdId, rows.map(addressOf));
  return rows.map((row) => {
    const title = titles.get(addressOf(row));
    return title ? { ...row, title } : row;
  });
}
