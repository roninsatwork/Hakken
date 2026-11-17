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
  const keeper = new Map<string, string | null>();
  for (const address of new Set(addresses)) {
    // An address or a path; never "(not set)", a page number or a blank.
    if (!/^https?:\/\//i.test(address) && !address.startsWith("/")) continue;
    // An address with a query is its page under another name — More Handles' Google Business link is its home page
    // with "?utm_source=GMB…" — and shows its address, so it never reads as the page itself.
    if (address.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").includes("?")) continue;
    const row = await ctx.db
      .query("holdPages")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", normalisePage(address)))
      .first();
    if (!row?.title) continue;
    if (!keeper.has(row.title)) keeper.set(row.title, await titleKeeper(ctx, holdId, row.title));
    if (keeper.get(row.title) === row.page) titles.set(address, row.title);
  }
  return titles;
}

/** Pages read to find who keeps a shared title: a title on more is a website's name, and names none of them. */
const SHARED_TITLE_MOST = 20;

/**
 * The page that keeps a title two or more pages share, so no two rows read the same (search-console-pages-way-1-plan-
 * 2026-11-17.md: three of More Handles' rows read "More Handles | Handles, Knobs & Door Furniture" — the home page,
 * /home and a Google Business link): the one with the most clicks, then visits, then the shortest address. The others
 * show their address. A title on twenty pages or more is kept by none. One read by the title's own index.
 */
async function titleKeeper(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, title: string): Promise<string | null> {
  const sharing = await ctx.db
    .query("holdPages")
    .withIndex("by_hold_title", (q) => q.eq("companyWebsiteId", holdId).eq("title", title))
    .take(SHARED_TITLE_MOST);
  if (sharing.length >= SHARED_TITLE_MOST) return null;
  const [first] = [...sharing].sort((left, right) => right.clicks - left.clicks
    || (right.visits ?? 0) - (left.visits ?? 0)
    || left.page.length - right.page.length
    || left.page.localeCompare(right.page));
  return first?.page ?? null;
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

/** Most pages a chart names at once: Search Console's Pages draws five ticked pages (`MOST_TICKED`). */
const TITLES_AT_ONCE = 5;

/**
 * A few pages' titles, for the names a chart draws its ticked pages by (Search Console's Pages,
 * search-console-pages-way-1-plan-2026-11-17.md): the first five pages asked, a title each where the website has one.
 * Only the caller's own website.
 */
export const pageTitlesFor = tenantQuery({
  args: { siteId: v.id("companyWebsites"), pages: v.array(v.string()) },
  returns: v.array(v.object({ page: v.string(), title: v.string() })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const titles = await titlesOf(ctx, site.hold._id, args.pages.slice(0, TITLES_AT_ONCE));
    return [...titles].map(([page, title]) => ({ page, title }));
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
