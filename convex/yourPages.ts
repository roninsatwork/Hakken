import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { YOUR_PAGES_COPY, YOUR_PAGES_FIELDS, requestHoldPages } from "./holdPages";
import { readPageKinds } from "./pageKinds";
import { requireMySite } from "./siteAccess";
import { readListCopy } from "./siteListCopies";
import { listOrder, listPageArgs, listPageResult, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { inGap, type PageFilter } from "./utils/holdPagesJoin";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import type { SortValue } from "./utils/sortOrder";
import { wordStartMatcher } from "./utils/wordStarts";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Your pages (Sites › Site, docs/plans/active/page-groups-plan.md, decision
 * 4): every page of the company's own website once — in its sitemap, crawled,
 * shown by Google, ranking — with the four figures, the gaps between them,
 * and each page's group.
 *
 * Read from the hold's compact copy (`holdPages.ts`), so one request
 * searches, filters, sorts and counts the whole list and cuts out the page
 * asked for (the Sites server pager); the figures and gaps were counted when
 * the copy was built.
 *
 * **The group** is the company's own classification of the page, by the one
 * rule every screen shares (`classifierFor`): "Not sorted" when none catches
 * it. Until the website has any classification, Hakken's own kind of page
 * shows instead — Anthony: "automated until they fill it out".
 *
 * **Only the company's own websites.** Read through the caller's hold
 * (`requireMySite`). A competitor's hold answers `own: false` and nothing
 * else: the company has no Search Console for a competitor, and Your pages is
 * the company's own list.
 */

/** A page as the copy holds it. */
type CopyRow = { page: string; file: string | null; crawled: boolean; shown: boolean; clicks: number; ranks: boolean; kind: string };

/** A page as the screen shows it: with its group — a classification's name, or null for Not sorted. */
type PageRow = CopyRow & { group: string | null; groupId: string | null };

const nullableString = v.union(v.string(), v.null());

const rowValidator = v.object({
  page: v.string(),
  file: nullableString,
  crawled: v.boolean(),
  shown: v.boolean(),
  ranks: v.boolean(),
  clicks: v.number(),
  /** The company's classification's name; null when none catches the page, or the website has none yet. */
  group: nullableString,
  /** Hakken's own kind of page, shown while the website has no classifications. */
  kind: v.string(),
});

export const summaryValidator = v.object({
  pages: v.number(),
  sitemap: v.number(),
  crawled: v.number(),
  shown: v.number(),
  ranking: v.number(),
  neverShown: v.number(),
  notInSitemap: v.number(),
  crawledNotInSitemap: v.number(),
  notCrawled: v.number(),
  /** Whether the sitemap has been read yet, where it was found, and what came of it. */
  sitemapRead: v.boolean(),
  sitemapSource: v.union(v.literal("ROBOTS"), v.literal("USUAL_ADDRESS"), v.literal("NONE"), v.null()),
  sitemapFiles: v.number(),
  sitemapFailed: v.number(),
  /** True when this company's `sitemapPagesRead` stopped the list short. */
  sitemapCut: v.boolean(),
  sitemapLimit: v.number(),
  sitemapDay: nullableString,
  /** Whether the company's Search Console is connected for the website, and the 90 days its figures cover. */
  console: v.boolean(),
  consoleFrom: nullableString,
  consoleTo: nullableString,
  crawlDay: nullableString,
  builtAt: v.number(),
});
export type YourPagesSummary = Infer<typeof summaryValidator>;

const filterValidator = v.union(
  v.literal("sitemap"),
  v.literal("crawled"),
  v.literal("shown"),
  v.literal("ranking"),
  v.literal("neverShown"),
  v.literal("notInSitemap"),
  v.literal("crawledNotInSitemap"),
  v.literal("notCrawled"),
);

type Sort = "page" | "group" | "file" | "clicks";

/**
 * The columns that sort, over the whole list (docs/plans/active/
 * sites-table-sorting-plan.md): the address, the group and the sitemap file A
 * to Z, the most clicks first — the order the page opens on. A page with no
 * group or no file sorts last either way. The yes-or-no columns do not sort.
 */
const SORTS: ListSorts<PageRow, Sort> = {
  page: { value: (row) => row.page, first: "asc" },
  // By the classification's name; with none yet, by Hakken's kind, a page not sorted yet last.
  group: { value: (row) => row.group ?? (row.groupId === null && row.kind !== "UNJUDGED" ? row.kind : null), first: "asc" },
  file: { value: (row) => row.file, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
};

const num = (value: string | number | null | undefined) => (typeof value === "number" ? value : 0);
const text = (value: string | number | null | undefined) => (typeof value === "string" ? value : null);

function summaryOf(meta: Record<string, string | number | null>, builtAt: number): YourPagesSummary {
  const source = text(meta.sitemapSource);
  return {
    pages: num(meta.pages),
    sitemap: num(meta.sitemap),
    crawled: num(meta.crawled),
    shown: num(meta.shown),
    ranking: num(meta.ranking),
    neverShown: num(meta.neverShown),
    notInSitemap: num(meta.notInSitemap),
    crawledNotInSitemap: num(meta.crawledNotInSitemap),
    notCrawled: num(meta.notCrawled),
    sitemapRead: num(meta.sitemapRead) === 1,
    sitemapSource: source === "ROBOTS" || source === "USUAL_ADDRESS" || source === "NONE" ? source : null,
    sitemapFiles: num(meta.sitemapFiles),
    sitemapFailed: num(meta.sitemapFailed),
    sitemapCut: num(meta.sitemapCut) === 1,
    sitemapLimit: num(meta.sitemapLimit),
    sitemapDay: text(meta.sitemapDay),
    console: num(meta.console) === 1,
    consoleFrom: text(meta.consoleFrom),
    consoleTo: text(meta.consoleTo),
    crawlDay: text(meta.crawlDay),
    builtAt,
  };
}

/** The value the Group filter takes for pages no classification catches. */
export const NOT_SORTED = "none";

/**
 * Every page of a hold's list, with its group, and how the list is grouped;
 * null when the list has not been built yet. Shared by the screen and its
 * download (`siteExports.ts`).
 */
export async function yourPagesList(ctx: QueryCtx, holdId: Id<"companyWebsites">): Promise<{
  rows: PageRow[];
  summary: YourPagesSummary;
  groupBy: "CLASSIFICATION" | "KIND";
  groups: Array<{ value: string; label: string }>;
} | null> {
  const copy = await readListCopy(ctx, YOUR_PAGES_COPY, `${holdId}`, YOUR_PAGES_FIELDS);
  if (!copy) return null;
  // The one setup every chart reads (`pageKinds.ts`); each page's sitemap file is in the copy, so none is looked up.
  const pageKinds = await readPageKinds(ctx, holdId, { pages: [] });
  const rows: PageRow[] = copy.rows.map(([page, file, crawled, shown, clicks, ranks, kind]) => {
    const row: CopyRow = {
      page: page as string,
      file: (file as string | null) ?? null,
      crawled: crawled === 1,
      shown: shown === 1,
      clicks: clicks as number,
      ranks: ranks === 1,
      kind: kind as string,
    };
    if (!pageKinds) return { ...row, group: null, groupId: null };
    const own = pageKinds.kindOf(row.page, row.file);
    const name = own === NOT_SORTED_KIND ? null : pageKinds.nameOf(own);
    return name === null ? { ...row, group: null, groupId: NOT_SORTED } : { ...row, group: name, groupId: own };
  });
  const groups = pageKinds
    ? pageKinds.choices.map((choice) => ({ value: choice.id, label: choice.name }))
    : [...new Set(rows.map((row) => row.kind))].sort().map((kind) => ({ value: kind, label: kind }));
  return { rows, summary: summaryOf(copy.meta, copy.builtAt), groupBy: pageKinds ? "CLASSIFICATION" : "KIND", groups };
}

/** The pages of a hold's list for the menu's count beside Your pages, or null before the list is built. Reads the copy's header only. */
export async function yourPagesCount(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<number | null> {
  const header = await ctx.db
    .query("siteListCopies")
    .withIndex("by_kind_key", (q) => q.eq("kind", YOUR_PAGES_COPY).eq("key", `${holdId}`))
    .unique();
  return header && header.fields.join("\u0000") === YOUR_PAGES_FIELDS.join("\u0000") ? header.rows : null;
}

/** A page as the screen gets it: the group's name, never its id. */
function screenRow(row: PageRow): Infer<typeof rowValidator> {
  return { page: row.page, file: row.file, crawled: row.crawled, shown: row.shown, ranks: row.ranks, clicks: row.clicks, group: row.group, kind: row.kind };
}

/** A row's value in one heading's column, for the download's order (`siteExports.ts`); null for a column the list does not sort by. */
export function yourPagesSortValue(sort: string | undefined, row: PageRow): SortValue {
  const column = sort && sort in SORTS ? SORTS[sort as Sort] : undefined;
  return column ? column.value(row) : null;
}

/** The list in one heading's order: shared by the screen and the download. */
export function yourPagesOrder(sort: Sort | undefined, direction: "asc" | "desc" | undefined) {
  return listOrder(SORTS, sort ?? "clicks", direction, (row: PageRow) => row.page);
}

/**
 * One page of Your pages: every page once, searched by its address (word
 * starts), narrowed to a figure or a gap and to a group, in a heading's order.
 */
export const listYourPages = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    filter: v.optional(filterValidator),
    group: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("page"), v.literal("group"), v.literal("file"), v.literal("clicks"))),
    direction: sortDirectionArg,
  },
  returns: v.object({
    ...listPageResult(rowValidator).fields,
    /** False on a competitor's hold: Your pages is the company's own websites'. */
    own: v.boolean(),
    summary: v.union(v.null(), summaryValidator),
    groupBy: v.union(v.literal("CLASSIFICATION"), v.literal("KIND")),
    /** The Group filter's choices: the company's classifications, or Hakken's kinds while it has none. */
    groups: v.array(v.object({ value: v.string(), label: v.string() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const none = { summary: null, groupBy: "KIND" as const, groups: [] };
    if (isTrackedHold(site.hold)) return { ...pageOfList<never>([], args.page, args.rows), own: false, ...none };
    const list = await yourPagesList(ctx, args.siteId);
    if (!list) return { ...preparingPage(args.rows), own: true, ...none };
    const matches = wordStartMatcher(args.search);
    const filter = args.filter as PageFilter | undefined;
    const narrowed = list.rows
      .filter((row) => (!matches || matches(row.page))
        && (!filter || inGap({ sitemapFile: row.file, crawled: row.crawled, shown: row.shown, ranks: row.ranks }, filter))
        && (!args.group || (list.groupBy === "CLASSIFICATION" ? row.groupId === args.group : row.kind === args.group)))
      .sort(yourPagesOrder(args.sort, args.direction));
    const shown = pageOfList(narrowed, args.page, args.rows);
    return {
      ...shown,
      rows: shown.rows.map(screenRow),
      own: true,
      summary: list.summary,
      groupBy: list.groupBy,
      groups: list.groups,
    };
  },
});

/**
 * The first visit to Your pages, before its list was ever built — a website
 * added since, or before the first collection: ask for it now.
 */
export const ensureYourPages = tenantMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    if ((await yourPagesCount(ctx, args.siteId)) !== null) return null;
    await requestHoldPages(ctx, args.siteId, 0);
    return null;
  },
});
