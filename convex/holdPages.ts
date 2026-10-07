import { v, type Infer, type Validator } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { readPeriod } from "./searchConsolePeriodReads";
import { dropCopies, writeListCopy } from "./siteListCopies";
import { claimSchedule, holdPagesKey, noteDataChanged } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { ownedHoldsOf, pagesStampOf, sitemapReadingOf } from "./sitemaps";
import { loadSite } from "./websiteSiteRows";
import { joinHoldPages, type JoinedPage } from "./utils/holdPagesJoin";
import { normalisePage } from "./utils/pageClassification";
import { onWebsite } from "./utils/sitemapReading";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Every page of a company's website once (`holdPages`), rebuilt from its
 * sources (docs/plans/active/page-groups-plan.md, decision 4): the website's
 * sitemap, the newest crawl's HTML pages, the pages ranking on Google from
 * the place the company watches from, and — the company's own — the pages
 * its Search Console shows over the last 90 days, with their clicks.
 *
 * **When.** After the sitemap is read, after a crawl's pages are filed, after
 * the rankings are rebuilt, and after Search Console settles — each asks
 * (`requestRebuild`, `requestWebsiteRebuilds`) and the rebuild runs shortly,
 * once for a burst of asks, one rebuild of a hold at a time (the site
 * rebuilds' own turn-taking, `beginRebuild`). The first visit to Your pages
 * asks too. A source that changes without asking — a Search Console
 * stopped, a limit or a place changed, a page's kind judged — notes it
 * (`noteHoldPagesChanged`), and the nightly refresh of the compact copies
 * (`refreshListCopies`) asks for any hold whose sources changed after its
 * last rebuild began, or whose last rebuild failed.
 *
 * **What it writes.** The rows, changed only where a page changed, so the
 * admin Page classification page reading them by index is not woken for
 * nothing; and a compact copy of the whole list with its counts
 * (`siteListCopies.ts`, kind `yourPages`), which Your pages searches, filters,
 * sorts and counts from in one read — the figures and gaps are counted here,
 * once, never by the screen.
 *
 * Only a company's own websites: a competitor has no Search Console of the
 * company's, and Your pages is for its own websites. A competitor's hold has
 * no rows, and one that was owned and is now watched loses them.
 */

/** The compact copy's kind and layout. The key is the hold's id. */
export const YOUR_PAGES_COPY = "yourPages";
export const YOUR_PAGES_FIELDS = ["page", "file", "crawled", "shown", "clicks", "ranks", "kind"] as const;

/** How long after an ask the rebuild runs: long enough for a burst of filings to ask once. */
const REBUILD_DELAY_MS = 20_000;

/** Rows read per request from each source: small rows, well inside a query's read limits. */
const SITEMAP_ROWS_READ = 2_000;
const CRAWL_ROWS_READ = 1_000;
const RANK_ROWS_READ = 1_000;
const TYPE_ROWS_READ = 1_000;
const HOLD_ROWS_READ = 1_000;

/** Rows inserted, replaced or removed per mutation. */
const HOLD_ROWS_WRITTEN = 200;

/** Rows removed per pass when a hold's pages are cleared. */
const HOLD_ROWS_CLEARED = 500;

/** Ask for a hold's pages to be rebuilt, once, shortly. */
export async function requestHoldPages(ctx: MutationCtx, holdId: Id<"companyWebsites">, delayMs = REBUILD_DELAY_MS): Promise<void> {
  if (!(await claimSchedule(ctx, holdPagesKey(holdId)))) return;
  await ctx.scheduler.runAfter(delayMs, internal.holdPages.rebuildHoldPages, { holdId });
}

/**
 * Note that what a hold's pages are built from changed — its Search Console
 * stopped, a limit or a place changed — without asking for a rebuild now: the
 * nightly refresh rebuilds it (`refreshListCopies`; dataforseo-cost-plan.md, A1).
 */
export async function noteHoldPagesChanged(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  await noteDataChanged(ctx, holdPagesKey(holdId));
}

/** The same for every company whose own website this is: a page's kind judged, a crawl kept. */
export async function noteWebsitePagesChanged(ctx: MutationCtx, websiteId: Id<"websites">): Promise<void> {
  for (const hold of await ownedHoldsOf(ctx, websiteId)) await noteHoldPagesChanged(ctx, hold._id);
}

/** Ask for one hold's pages: Search Console settled for it, or its sources changed since its last rebuild. */
export const requestRebuild = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (hold && !isTrackedHold(hold)) await requestHoldPages(ctx, args.holdId);
    return null;
  },
});

/** Ask for the pages of every company whose own website this is: its sitemap, crawl or rankings changed. */
export const requestWebsiteRebuilds = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const hold of await ownedHoldsOf(ctx, args.websiteId)) await requestHoldPages(ctx, hold._id);
    return null;
  },
});

const nullableString = v.union(v.string(), v.null());

const headValidator = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  place: v.number(),
  /** This company's `sitemapPagesRead`. */
  limit: v.number(),
  sitemap: v.union(v.null(), v.object({
    readAt: v.number(),
    source: v.union(v.literal("ROBOTS"), v.literal("USUAL_ADDRESS"), v.literal("NONE")),
    files: v.number(),
    failed: v.number(),
    cut: v.boolean(),
    day: v.string(),
  })),
  crawl: v.union(v.null(), v.object({ pullId: v.id("seoDataPulls"), day: v.string(), cut: v.boolean() })),
  console: v.object({ connected: v.boolean(), from: nullableString, to: nullableString }),
});
type Head = Infer<typeof headValidator>;

/** What a rebuild starts from: the website, the company's limit, and which reading, crawl and Search Console it reads. Null for a hold that is gone or a competitor. */
export const rebuildHead = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), headValidator),
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.holdId);
    if (!site || isTrackedHold(site.hold)) return null;
    const websiteId = site.website._id;
    const [limits, reading, crawl, connection] = await Promise.all([
      readFanOutLimits(ctx, site.hold.companyId, site.hold._id),
      sitemapReadingOf(ctx, websiteId),
      ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId)).order("desc").first(),
      ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first(),
    ]);
    const connected = connection?.status === "CONNECTED" && !connection.clearing && Boolean(connection.newestDay);
    const period = connected ? await readPeriod(ctx, args.holdId, "web", "page", "90", "NOW") : null;
    return {
      websiteId,
      host: site.website.host,
      place: site.place,
      limit: limits.sitemapPagesRead,
      sitemap: reading ? {
        // The stamp its pages carry: a reading that found the same pages kept the last one's.
        readAt: pagesStampOf(reading),
        source: reading.source,
        files: reading.files.filter((file) => !file.problem).length,
        failed: reading.files.filter((file) => file.problem).length,
        cut: reading.cut,
        day: reading.day,
      } : null,
      crawl: crawl ? { pullId: crawl.pullId, day: crawl.day, cut: crawl.detailCut === true } : null,
      console: { connected, from: period?.from ?? null, to: period?.to ?? null },
    };
  },
});

/** One batch of a source, as a paged read answers it. */
function pageOf<Row extends Validator<unknown, "required", string>>(row: Row) {
  return v.object({ rows: v.array(row), cursor: v.string(), isDone: v.boolean() });
}
const cursorArg = v.union(v.string(), v.null());

/** One batch of a sitemap reading's pages, in the order read. */
export const sitemapPagesPage = internalQuery({
  args: { websiteId: v.id("websites"), readAt: v.number(), cursor: cursorArg },
  returns: pageOf(v.object({ page: v.string(), file: v.string() })),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteSitemapPages")
      .withIndex("by_website_read", (q) => q.eq("websiteId", args.websiteId).eq("readAt", args.readAt))
      .paginate({ cursor: args.cursor, numItems: SITEMAP_ROWS_READ });
    return { rows: result.page.map((row) => ({ page: row.page, file: row.file })), cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** One batch of a crawl's pages: each address, and what kind of answer it gave. */
export const crawlPagesPage = internalQuery({
  args: { pullId: v.id("seoDataPulls"), cursor: cursorArg },
  returns: pageOf(v.object({ url: v.string(), resourceType: v.optional(v.string()), statusCode: v.optional(v.number()) })),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteCrawlPages")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .paginate({ cursor: args.cursor, numItems: CRAWL_ROWS_READ });
    return {
      rows: result.page.map((row) => ({
        url: row.url,
        ...(row.resourceType !== undefined ? { resourceType: row.resourceType } : {}),
        ...(row.statusCode !== undefined ? { statusCode: row.statusCode } : {}),
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** One batch of the pages ranking on Google from one place, with their judged kind. */
export const rankedPagesPage = internalQuery({
  args: { websiteId: v.id("websites"), place: v.number(), cursor: cursorArg },
  returns: pageOf(v.object({ page: v.string(), url: v.optional(v.string()), pageType: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sitePageRanks")
      .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place))
      .paginate({ cursor: args.cursor, numItems: RANK_ROWS_READ });
    return {
      rows: result.page.map((row) => ({ page: row.page, url: row.url, ...(row.pageType ? { pageType: row.pageType } : {}) })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** One batch of the kinds judged for the website's pages. */
export const judgedTypesPage = internalQuery({
  args: { websiteId: v.id("websites"), cursor: cursorArg },
  returns: pageOf(v.object({ page: v.string(), pageType: v.string() })),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("sitePageTypes")
      .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId))
      .paginate({ cursor: args.cursor, numItems: TYPE_ROWS_READ });
    return { rows: result.page.map((row) => ({ page: row.page, pageType: row.pageType })), cursor: result.continueCursor, isDone: result.isDone };
  },
});

/**
 * Pages returned per read: a function's answer holds at most 8,192 to a list.
 * morehandles.co.uk's 90 days showed 13,813, and its Your pages never rebuilt
 * (found 2026-10-06).
 */
const CONSOLE_PAGES_PER_READ = 4_000;

/**
 * The pages the company's own Search Console shows over the last 90 days,
 * folded to their page with their clicks added up: the ready-made period
 * (`readPeriod`), read by the hold. Only the website's own host and its twin.
 * A part at a time, in page order, from `start`; `next` is where the next
 * part starts, null after the last.
 */
export const consolePages = internalQuery({
  args: { holdId: v.id("companyWebsites"), host: v.string(), start: v.optional(v.number()) },
  returns: v.object({ pages: v.array(v.object({ key: v.string(), clicks: v.number() })), next: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const period = await readPeriod(ctx, args.holdId, "web", "page", "90", "NOW");
    const clicks = new Map<string, number>();
    for (const row of period?.rows ?? []) {
      if (!onWebsite(row.key, args.host)) continue;
      const page = normalisePage(row.key);
      clicks.set(page, (clicks.get(page) ?? 0) + row.clicks);
    }
    const all = [...clicks].sort(([one], [two]) => (one < two ? -1 : one > two ? 1 : 0));
    const start = args.start ?? 0;
    const end = start + CONSOLE_PAGES_PER_READ;
    return {
      pages: all.slice(start, end).map(([key, total]) => ({ key, clicks: total })),
      next: end < all.length ? end : null,
    };
  },
});

/** Every page the company's own Search Console shows, read a part at a time (`consolePages`). */
async function allConsolePages(ctx: ActionCtx, holdId: Id<"companyWebsites">, host: string): Promise<Array<{ key: string; clicks: number }>> {
  const pages: Array<{ key: string; clicks: number }> = [];
  for (let start: number | null = 0; start !== null;) {
    const part: { pages: Array<{ key: string; clicks: number }>; next: number | null } =
      await ctx.runQuery(internal.holdPages.consolePages, { holdId, host, start });
    pages.push(...part.pages);
    start = part.next;
  }
  return pages;
}

const holdRowValidator = v.object({
  _id: v.id("holdPages"),
  page: v.string(),
  sitemapFile: v.optional(v.string()),
  crawled: v.boolean(),
  shown: v.boolean(),
  clicks: v.number(),
  ranks: v.boolean(),
  pageType: v.optional(v.string()),
});

/** One batch of a hold's rows as they stand, to work out what changed. */
export const holdPagesPage = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: cursorArg },
  returns: pageOf(holdRowValidator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("holdPages")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: HOLD_ROWS_READ });
    return {
      rows: result.page.map((row) => ({
        _id: row._id,
        page: row.page,
        ...(row.sitemapFile !== undefined ? { sitemapFile: row.sitemapFile } : {}),
        crawled: row.crawled,
        shown: row.shown,
        clicks: row.clicks,
        ranks: row.ranks,
        ...(row.pageType !== undefined ? { pageType: row.pageType } : {}),
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

const writeRowValidator = v.object({
  id: v.optional(v.id("holdPages")),
  page: v.string(),
  sitemapFile: v.optional(v.string()),
  crawled: v.boolean(),
  shown: v.boolean(),
  clicks: v.number(),
  ranks: v.boolean(),
  pageType: v.string(),
});

/** One batch of a rebuild's changes: pages new or changed, and pages no longer found anywhere. Only this hold's rows. */
export const applyHoldPages = internalMutation({
  args: { holdId: v.id("companyWebsites"), rows: v.array(writeRowValidator), removed: v.array(v.id("holdPages")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const { id, ...row } of args.rows) {
      const fields = { companyWebsiteId: args.holdId, ...row };
      const existing = id ? await ctx.db.get(id) : null;
      if (existing && existing.companyWebsiteId === args.holdId) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("holdPages", fields);
    }
    for (const id of args.removed) {
      const existing = await ctx.db.get(id);
      if (existing && existing.companyWebsiteId === args.holdId) await ctx.db.delete(id);
    }
    return null;
  },
});

/** A batch of a hold's rows and its compact copy removed; whether any remain. */
async function clearHoldPagesBatch(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<boolean> {
  const rows = await ctx.db
    .query("holdPages")
    .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId))
    .take(HOLD_ROWS_CLEARED);
  for (const row of rows) await ctx.db.delete(row._id);
  const copyLeft = await dropCopies(ctx, YOUR_PAGES_COPY, `${holdId}`);
  return rows.length === HOLD_ROWS_CLEARED || copyLeft;
}

/** One step of clearing a hold's pages from a rebuild; whether more remains. */
export const clearHoldPagesStep = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.boolean(),
  handler: async (ctx, args) => await clearHoldPagesBatch(ctx, args.holdId),
});

/** A hold's pages and copy, cleared when the hold goes (`websitePurge.ts`, `websites.ts`), a batch at a time. */
export const purgeHoldPages = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await clearHoldPagesBatch(ctx, args.holdId)) await ctx.scheduler.runAfter(0, internal.holdPages.purgeHoldPages, args);
    return null;
  },
});

type Page<Row> = { rows: Row[]; cursor: string; isDone: boolean };

/** Every row of a source, a batch per request. */
async function readAll<Row>(read: (cursor: string | null) => Promise<Page<Row>>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let cursor: string | null = null; ;) {
    const page: Page<Row> = await read(cursor);
    rows.push(...page.rows);
    if (page.isDone) return rows;
    cursor = page.cursor;
  }
}

type HoldRow = Infer<typeof holdRowValidator>;

function unchanged(old: HoldRow, row: JoinedPage): boolean {
  return (old.sitemapFile ?? null) === row.sitemapFile
    && old.crawled === row.crawled
    && old.shown === row.shown
    && old.clicks === row.clicks
    && old.ranks === row.ranks
    && (old.pageType ?? "UNJUDGED") === row.pageType;
}

/** The copy's facts about the whole list: the counts, and what each source was. Every value a number, a word or null. */
function copyMeta(head: Head, counts: ReturnType<typeof joinHoldPages>["counts"], heldCut: boolean): Record<string, string | number | null> {
  return {
    ...counts,
    sitemapRead: head.sitemap ? 1 : 0,
    sitemapSource: head.sitemap?.source ?? null,
    sitemapFiles: head.sitemap?.files ?? 0,
    sitemapFailed: head.sitemap?.failed ?? 0,
    sitemapCut: head.sitemap && (head.sitemap.cut || heldCut) ? 1 : 0,
    sitemapLimit: head.limit,
    sitemapDay: head.sitemap?.day ?? null,
    console: head.console.connected ? 1 : 0,
    consoleFrom: head.console.from,
    consoleTo: head.console.to,
    crawlDay: head.crawl?.day ?? null,
    crawlCut: head.crawl?.cut ? 1 : 0,
  };
}

async function rebuildNow(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<void> {
  const head: Head | null = await ctx.runQuery(internal.holdPages.rebuildHead, { holdId });
  if (!head) {
    // Gone, or a competitor now: nothing of its own to list.
    while (await ctx.runMutation(internal.holdPages.clearHoldPagesStep, { holdId })) {
      // Each step removes a batch; the next takes the rest.
    }
    return;
  }
  const { websiteId, place } = head;
  const sitemap = head.sitemap
    ? await readAll((cursor) => ctx.runQuery(internal.holdPages.sitemapPagesPage, { websiteId, readAt: head.sitemap!.readAt, cursor }))
    : [];
  const crawl = head.crawl;
  const crawled = crawl ? await readAll((cursor) => ctx.runQuery(internal.holdPages.crawlPagesPage, { pullId: crawl.pullId, cursor })) : [];
  const ranked = await readAll((cursor) => ctx.runQuery(internal.holdPages.rankedPagesPage, { websiteId, place, cursor }));
  const judged = await readAll((cursor) => ctx.runQuery(internal.holdPages.judgedTypesPage, { websiteId, cursor }));
  const shown = head.console.connected ? await allConsolePages(ctx, holdId, head.host) : null;
  const joined = joinHoldPages({ host: head.host, sitemap, sitemapLimit: head.limit, crawled, ranked, shown, judged });

  // Only what changed is written: the rest of the rows stay as they are.
  const existing = await readAll((cursor) => ctx.runQuery(internal.holdPages.holdPagesPage, { holdId, cursor }));
  const before = new Map<string, HoldRow>();
  const removed: Id<"holdPages">[] = [];
  for (const row of existing) {
    // Two rows for one page — a rebuild that died half-way — keep one.
    const twin = before.get(row.page);
    if (twin) removed.push(twin._id);
    before.set(row.page, row);
  }
  const writes: Array<Infer<typeof writeRowValidator>> = [];
  for (const row of joined.pages) {
    const old = before.get(row.page);
    before.delete(row.page);
    if (old && unchanged(old, row)) continue;
    writes.push({
      ...(old ? { id: old._id } : {}),
      page: row.page,
      ...(row.sitemapFile !== null ? { sitemapFile: row.sitemapFile } : {}),
      crawled: row.crawled,
      shown: row.shown,
      clicks: row.clicks,
      ranks: row.ranks,
      pageType: row.pageType,
    });
  }
  for (const gone of before.values()) removed.push(gone._id);
  for (let start = 0; start < writes.length; start += HOLD_ROWS_WRITTEN) {
    await ctx.runMutation(internal.holdPages.applyHoldPages, { holdId, rows: writes.slice(start, start + HOLD_ROWS_WRITTEN), removed: [] });
  }
  for (let start = 0; start < removed.length; start += HOLD_ROWS_WRITTEN) {
    await ctx.runMutation(internal.holdPages.applyHoldPages, { holdId, rows: [], removed: removed.slice(start, start + HOLD_ROWS_WRITTEN) });
  }

  await writeListCopy(ctx, {
    kind: YOUR_PAGES_COPY,
    key: `${holdId}`,
    fields: YOUR_PAGES_FIELDS,
    rows: joined.pages.map((row) => [row.page, row.sitemapFile, row.crawled ? 1 : 0, row.shown ? 1 : 0, row.clicks, row.ranks ? 1 : 0, row.pageType]),
    meta: copyMeta(head, joined.counts, joined.heldCut),
  });
}

/** Rebuild a hold's pages now, taking the hold's turn; one already running sends this one to wait. */
export const rebuildHoldPages = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = holdPagesKey(args.holdId);
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.holdPages.rebuildHoldPages, args);
      return null;
    }
    let done = false;
    try {
      await rebuildNow(ctx, args.holdId);
      done = true;
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key, done });
    }
    return null;
  },
});
