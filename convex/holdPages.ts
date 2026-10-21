import { v, type Infer, type Validator } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { RECENT_PERIODS, holdingPeriod, periodFromParts } from "./searchConsolePeriodReads";
import { wholeBookFromAction } from "./searchConsolePeriodBooks";
import { tokenPlace } from "./utils/searchConsoleTerms";
import { dropCopies, writeListCopy } from "./siteListCopies";
import { claimSchedule, holdPagesKey, noteDataChanged } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { ownedHoldsOf, pagesStampOf, sitemapReadingOf } from "./sitemaps";
import { loadSite } from "./websiteSiteRows";
import { joinHoldPages, type JoinedPage } from "./utils/holdPagesJoin";
import { normalisePage } from "./utils/pageClassification";
import { onWebsite } from "./utils/sitemapReading";
import { isTrackedHold } from "./utils/websitePairing";
import { sitemapPagesPage as readSitemapPages } from "./sitemapParts";
import { addressOf } from "./utils/pageAddresses";
import { addressesOf, decodeWith, isPageRef } from "./holdPageRefs";
import { slotKey } from "./googleAnalyticsLists";
import { unpackNumbers } from "./utils/searchConsolePacks";

/**
 * Every page of a company's website once (`holdPages`), rebuilt from its
 * sources (docs/plans/active/page-groups-plan.md, decision 4): the website's
 * sitemap, the newest crawl's HTML pages, the pages ranking on Google from
 * the place the company watches from, and — the company's own — the pages
 * its Search Console shows over the last 90 days, with their clicks, and the
 * visits its Google Analytics saw land on each (google-analytics-plan.md §4.6).
 *
 * **When.** After the sitemap is read, after a crawl's pages are filed, after
 * the rankings are rebuilt, after Search Console settles and after Google
 * Analytics is collected — each asks
 * (`requestRebuild`, `requestWebsiteRebuilds`) and the rebuild runs shortly,
 * once for a burst of asks, one rebuild of a hold at a time (the site
 * rebuilds' own turn-taking, `beginRebuild`). The first visit to Your pages
 * asks too. A source that changes without asking — a Search Console or
 * Google Analytics stopped or switched to another property, a limit or a
 * place changed, a page's kind judged — notes it
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
  await ctx.scheduler.runAfter(delayMs, internal.holdPagesSteps.rebuildHoldPages, { holdId });
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
  /** Whether the company's own Google Analytics is connected with figures: its landing pages' visits are read only then. */
  analytics: v.boolean(),
  /** Whether Bing Webmaster is connected with its ready-made lists built: its pages' clicks are read only then. */
  bing: v.boolean(),
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
    const [limits, reading, crawl, connection, analytics] = await Promise.all([
      readFanOutLimits(ctx, site.hold.companyId, site.hold._id),
      sitemapReadingOf(ctx, websiteId),
      ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId)).order("desc").first(),
      ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first(),
      ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first(),
    ]);
    const bing = await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const connected = connection?.status === "CONNECTED" && !connection.clearing && Boolean(connection.newestDay);
    // Its dates are on the newest builds' first parts — last quarter's first day to this quarter's last — the whole period,
    // and its book, read here until 2026-10-15 (RR3).
    const [latest, earlier] = connected ? [await newestConsoleBuild(ctx, args.holdId, "thisQuarter"), await newestConsoleBuild(ctx, args.holdId, "lastQuarter")] : [null, null];
    const period = latest || earlier ? { from: (earlier ?? latest)!.from, to: (latest ?? earlier)!.to } : null;
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
      analytics: analytics?.status === "CONNECTED" && !analytics.clearing && Boolean(analytics.newestDay),
      bing: bing?.status === "CONNECTED" && !bing.clearing && Boolean(bing.periodsAt),
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
    // A reading's pages, a thousand a record (`sitemapParts.ts`).
    const read = await readSitemapPages(ctx, args);
    return { ...read, rows: read.rows.map((row) => ({ page: row.page, file: row.file })) };
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
    const host = (await ctx.db.get(args.websiteId))?.host ?? "";
    return {
      rows: result.page.map((row) => ({ page: row.page, url: addressOf(row, host), ...(row.pageType ? { pageType: row.pageType } : {}) })),
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
 * Parts of the 90-day page period read a call: 2,000 rows each, inside the
 * 8,192 a function's answer holds to a list. morehandles.co.uk's 90 days
 * showed 13,813 pages, and its Your pages never rebuilt (found 2026-10-06).
 */
const CONSOLE_PARTS_PER_READ = 2;

/** Times the period is read again from its start when Search Console swaps in a new build part-way through. */
const CONSOLE_READ_TRIES = 3;

/**
 * The newest build of one of the company's own recent page periods — this quarter or last (`RECENT_PERIODS`, in place
 * of the 90 days until the calendar periods) — as its screens read it, or the period it repeats. Null when there is none.
 */
async function newestConsoleBuild(ctx: QueryCtx, holdId: Id<"companyWebsites">, recent: (typeof RECENT_PERIODS)[number]): Promise<Doc<"searchConsolePeriods"> | null> {
  const period = await holdingPeriod(ctx, { companyWebsiteId: holdId, country: undefined, searchType: "web", list: "page" }, recent);
  // The first part of each build: an older build is beside the newest only while it is being cleared.
  const firsts = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", holdId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", period).eq("which", "NOW").eq("part", 0))
    .take(4);
  return firsts.reduce<Doc<"searchConsolePeriods"> | null>((newest, part) => (!newest || part.builtAt > newest.builtAt ? part : newest), null);
}

/**
 * Part of the pages the company's own Search Console shows over the last 90
 * days, with their clicks, as stored: a few parts of one build a call, from
 * `start` (collection-reliability-plan.md, RR3). Until 2026-10-15 each call
 * read the whole period and the whole book of its pages, to hand back 4,000
 * of them. Pages are left as places in the build's book when it keeps them so
 * (`tokens`); the rebuild reads the book once. `moved` when the build read
 * from was replaced since the first part; null when there is none.
 */
export const consolePagesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), period: v.union(v.literal("thisQuarter"), v.literal("lastQuarter")), builtAt: v.optional(v.number()), start: v.number() },
  returns: v.union(
    v.null(),
    v.object({ moved: v.literal(true) }),
    v.object({ builtAt: v.number(), tokens: v.boolean(), rows: v.array(v.object({ key: v.string(), clicks: v.number() })), next: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const newest = await newestConsoleBuild(ctx, args.holdId, args.period);
    if (args.builtAt !== undefined && newest?.builtAt !== args.builtAt) return { moved: true as const };
    if (!newest) return null;
    const parts = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_slot_built", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", newest.period).eq("which", "NOW")
        .eq("builtAt", newest.builtAt).gte("part", args.start))
      .take(CONSOLE_PARTS_PER_READ + 1);
    const read = await periodFromParts(ctx, args.holdId, "web", "page", parts.slice(0, CONSOLE_PARTS_PER_READ), undefined, false);
    return {
      builtAt: newest.builtAt,
      tokens: read?.book !== null && read?.book !== undefined,
      rows: (read?.rows ?? []).map((row) => ({ key: row.key, clicks: row.clicks })),
      next: parts.length > CONSOLE_PARTS_PER_READ ? parts[CONSOLE_PARTS_PER_READ].part : null,
    };
  },
});

type ConsolePart = { moved: true } | { builtAt: number; tokens: boolean; rows: Array<{ key: string; clicks: number }>; next: number | null } | null;

/**
 * Every page the company's own Search Console shows over the last 90 days,
 * folded to its page with its clicks added up: read a few parts at a time
 * (`consolePagesPart`), all from one build, the build's book of pages read once.
 * Only the website's own host and its twin.
 */
async function allConsolePages(ctx: ActionCtx, holdId: Id<"companyWebsites">, host: string): Promise<Array<{ key: string; clicks: number }>> {
  // This quarter's and last quarter's pages, each page's clicks added together (calendar-periods-plan.md, phase 4).
  const clicks = new Map<string, number>();
  for (const period of RECENT_PERIODS) {
    for (const row of await consolePagesOf(ctx, holdId, host, period)) clicks.set(row.key, (clicks.get(row.key) ?? 0) + row.clicks);
  }
  return [...clicks].map(([key, total]) => ({ key, clicks: total }));
}

/** One recent period's pages on the website, each with its clicks: all from one build, its book of pages read once. */
async function consolePagesOf(ctx: ActionCtx, holdId: Id<"companyWebsites">, host: string, period: (typeof RECENT_PERIODS)[number]): Promise<Array<{ key: string; clicks: number }>> {
  for (let tries = 1; ; tries += 1) {
    const rows: Array<{ key: string; clicks: number }> = [];
    let builtAt: number | undefined;
    let tokens = false;
    let moved = false;
    for (let start: number | null = 0; start !== null;) {
      const part: ConsolePart = await ctx.runQuery(internal.holdPages.consolePagesPart, { holdId, period, builtAt, start });
      if (part === null) return [];
      if ("moved" in part) {
        moved = true;
        break;
      }
      builtAt = part.builtAt;
      tokens ||= part.tokens;
      rows.push(...part.rows);
      start = part.next;
    }
    // A new build swapped in part-way: read again from its start. Should it keep moving, the rows read stand
    // until the next rebuild, which the settle that swapped it in asks for.
    if (moved && tries < CONSOLE_READ_TRIES) continue;
    const book = tokens && builtAt !== undefined ? await wholeBookFromAction(ctx, { companyWebsiteId: holdId, searchType: "web", builtAt }, "page") : [];
    const clicks = new Map<string, number>();
    for (const row of rows) {
      const at = tokenPlace(row.key);
      const address = at ? book[at.place] ?? "" : row.key;
      if (!onWebsite(address, host)) continue;
      const page = normalisePage(address);
      clicks.set(page, (clicks.get(page) ?? 0) + row.clicks);
    }
    return [...clicks].map(([key, total]) => ({ key, clicks: total }));
  }
}

/** Google Analytics' landing pages over the last 90 days, for every device: the ready-made list a collection keeps. */
const LANDING_90 = slotKey("landing", "90", "NOW", "");

/** Parts of the landing list read a call: up to 2,000 rows each, inside the 8,192 a function's answer holds to a list. */
const LANDING_PARTS_PER_READ = 3;

/** Times the landing list is read again from its start when a collection swaps in a new build part-way through. */
const LANDING_READ_TRIES = 3;

/**
 * Part of the company's own Google Analytics landing pages over the last 90
 * days (`googleAnalyticsCollect.ts`): each page by its number in the hold's
 * page numbering, with its visits, read by the hold. A few parts at a time
 * from `start`, from the build in `slot` — the one screens read when the
 * first part was — with `next` where the next part starts, null after the
 * last. Null when there is no list yet; `moved` when a new build was swapped
 * in since the first part.
 */
export const landingVisits = internalQuery({
  args: { holdId: v.id("companyWebsites"), slot: v.optional(v.number()), start: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ moved: v.literal(true) }),
    v.object({ slot: v.number(), rows: v.array(v.object({ key: v.string(), visits: v.number() })), next: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("key", LANDING_90))
      .first();
    if (!held) return null;
    if (args.slot !== undefined && held.slot !== args.slot) return { moved: true as const };
    const start = args.start ?? 0;
    const end = Math.min(held.parts, start + LANDING_PARTS_PER_READ);
    const parts = await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("key", LANDING_90).eq("slot", held.slot).gte("part", start).lt("part", end))
      .take(LANDING_PARTS_PER_READ);
    const rows: Array<{ key: string; visits: number }> = [];
    for (const part of parts) {
      const visits = unpackNumbers(part.visits);
      // "(not set)" — visits Google could not name the landing page of — is no page.
      part.keys.forEach((key, at) => {
        if (isPageRef(key)) rows.push({ key, visits: visits[at] ?? 0 });
      });
    }
    return { slot: held.slot, rows, next: end < held.parts ? end : null };
  },
});

/** Titles read a call: each a short string. */
const TITLES_PER_READ = 500;

/** A page of the company's own Google Analytics' page titles (GA27, §18.6.3), by page number. */
export const titlesPage = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: cursorArg },
  returns: pageOf(v.object({ key: v.string(), title: v.string() })),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("googleAnalyticsTitles")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: TITLES_PER_READ });
    return { rows: result.page.map((row) => ({ key: row.page, title: row.title })), cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Every page title, by address: the page numbers read back with the hold's numbering. */
async function allTitles(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Array<{ key: string; title: string }>> {
  const rows = await readAll((cursor) => ctx.runQuery(internal.holdPages.titlesPage, { holdId, cursor }));
  const addresses = decodeWith(await addressesOf(ctx, holdId), rows.map((row) => row.key));
  return rows.map((row, at) => ({ key: addresses[at], title: row.title }));
}

type LandingPart = { moved: true } | { slot: number; rows: Array<{ key: string; visits: number }>; next: number | null } | null;

/**
 * Every landing page of the company's own Google Analytics over the last 90
 * days, by address: read a part at a time (`landingVisits`), all from one
 * build, and the page numbers read back with the hold's numbering, read once
 * this run (`addressesOf`).
 */
async function allLandingVisits(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Array<{ key: string; visits: number }>> {
  for (let tries = 1; ; tries += 1) {
    const rows: Array<{ key: string; visits: number }> = [];
    let slot: number | undefined;
    let moved = false;
    for (let start: number | null = 0; start !== null;) {
      const part: LandingPart = await ctx.runQuery(internal.holdPages.landingVisits, { holdId, slot, start });
      if (part === null) return [];
      if ("moved" in part) {
        moved = true;
        break;
      }
      slot = part.slot;
      rows.push(...part.rows);
      start = part.next;
    }
    // A new build swapped in part-way: read again from its start. Should it keep moving, the rows read stand
    // until the next rebuild, which that collection asks for when it finishes.
    if (moved && tries < LANDING_READ_TRIES) continue;
    const addresses = decodeWith(await addressesOf(ctx, holdId), rows.map((row) => row.key));
    return rows.map((row, at) => ({ key: addresses[at], visits: row.visits }));
  }
}

const holdRowValidator = v.object({
  _id: v.id("holdPages"),
  page: v.string(),
  sitemapFile: v.optional(v.string()),
  crawled: v.boolean(),
  shown: v.boolean(),
  clicks: v.number(),
  /** Absent on a row not rewritten since visits were added: none. */
  visited: v.optional(v.boolean()),
  visits: v.optional(v.number()),
  title: v.optional(v.string()),
  bingClicks: v.optional(v.number()),
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
        ...(row.visited !== undefined ? { visited: row.visited } : {}),
        ...(row.visits !== undefined ? { visits: row.visits } : {}),
        ...(row.title !== undefined ? { title: row.title } : {}),
        ...(row.bingClicks !== undefined ? { bingClicks: row.bingClicks } : {}),
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
  visited: v.boolean(),
  visits: v.number(),
  title: v.optional(v.string()),
  bingClicks: v.optional(v.number()),
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

/** Whether a row already says what the sources say. A row written before visits were added has none. */
function unchanged(old: HoldRow, row: JoinedPage): boolean {
  return (old.sitemapFile ?? null) === row.sitemapFile
    && old.crawled === row.crawled
    && old.shown === row.shown
    && old.clicks === row.clicks
    && (old.visited ?? false) === row.visited
    && (old.visits ?? 0) === row.visits
    && (old.title ?? null) === row.title
    && (old.bingClicks ?? 0) === row.bingClicks
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

/** One part of Bing's ready-made pages for this quarter or last: each page's number and its clicks (bing-webmaster-plan.md §4.3). */
export const bingPagesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), part: v.number(), period: v.union(v.literal("thisQuarter"), v.literal("lastQuarter")) },
  returns: v.union(v.null(), v.object({ numbers: v.array(v.number()), clicks: v.array(v.number()) })),
  handler: async (ctx, args) => {
    const parts = await ctx.db
      .query("bingPeriods")
      .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", "page").eq("period", args.period).eq("which", "NOW").eq("part", args.part))
      .take(4);
    const newest = parts.sort((left, right) => right.builtAt - left.builtAt)[0];
    return newest ? { numbers: unpackNumbers(newest.keys), clicks: unpackNumbers(newest.clicks) } : null;
  },
});

/**
 * Every page Bing clicked to this quarter or last, by address, each page's clicks added together as Search Console's
 * are (calendar-periods-plan.md, phase 5), read a part at a time (`bingPagesPart`). The two quarters' weeks never overlap.
 */
async function allBingClicks(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Array<{ key: string; clicks: number }>> {
  const addresses = await addressesOf(ctx, holdId);
  const clicks = new Map<string, number>();
  for (const period of RECENT_PERIODS) {
    for (let part = 0; ; part += 1) {
      const read: { numbers: number[]; clicks: number[] } | null = await ctx.runQuery(internal.holdPages.bingPagesPart, { holdId, part, period });
      if (!read) break;
      for (const [at, number] of read.numbers.entries()) {
        const key = addresses.addresses[number];
        if (key) clicks.set(key, (clicks.get(key) ?? 0) + (read.clicks[at] ?? 0));
      }
    }
  }
  return [...clicks].map(([key, total]) => ({ key, clicks: total }));
}

/** What a rebuild changed: pages written (new or changed) and pages removed; null when the hold lists nothing of its own. */
export type Rebuilt = { written: number; removed: number } | null;

async function rebuildNow(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Rebuilt> {
  const head: Head | null = await ctx.runQuery(internal.holdPages.rebuildHead, { holdId });
  if (!head) {
    // Gone, or a competitor now: nothing of its own to list.
    while (await ctx.runMutation(internal.holdPages.clearHoldPagesStep, { holdId })) {
      // Each step removes a batch; the next takes the rest.
    }
    return null;
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
  const visited = head.analytics ? await allLandingVisits(ctx, holdId) : null;
  const titled = head.analytics ? await allTitles(ctx, holdId) : null;
  const bingClicked = head.bing ? await allBingClicks(ctx, holdId) : null;
  const joined = joinHoldPages({ host: head.host, sitemap, sitemapLimit: head.limit, crawled, ranked, shown, visited, titled, bingClicked, judged });

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
      visited: row.visited,
      visits: row.visits,
      ...(row.title !== null ? { title: row.title } : {}),
      ...(head.bing ? { bingClicks: row.bingClicks } : {}),
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
  return { written: writes.length, removed: removed.length };
}

/** What a rebuild answers: what it changed, which says that a page unchanged is not written again. */
export const rebuiltValidator = v.union(v.null(), v.object({ written: v.number(), removed: v.number() }));

/**
 * Rebuild a hold's pages now, taking the hold's turn; one already running sends this one to wait.
 * Run in the Node runtime (`holdPagesSteps.ts`): it holds every source's pages at once to join them,
 * and a website ten times kordatackle.com's is more than the default runtime's 64 MB
 * (collection-reliability-plan.md, RR3).
 */
export async function rebuildHoldPagesHandler(ctx: ActionCtx, args: { holdId: Id<"companyWebsites"> }): Promise<Rebuilt> {
  const key = holdPagesKey(args.holdId);
  if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
    await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.holdPagesSteps.rebuildHoldPages, args);
    return null;
  }
  let done = false;
  let rebuilt: Rebuilt = null;
  try {
    rebuilt = await rebuildNow(ctx, args.holdId);
    done = true;
  } finally {
    await ctx.runMutation(internal.siteSummaries.endRebuild, { key, done });
  }
  return rebuilt;
}

/**
 * A rebuild booked before it moved to the Node runtime (2026-10-15), handed on to it: a booking whose
 * function had gone would fail, and leave the hold's rebuild claimed. Nothing books this one now.
 */
export const rebuildHoldPages = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.holdPagesSteps.rebuildHoldPages, args);
    return null;
  },
});
