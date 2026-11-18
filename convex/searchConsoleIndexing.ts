import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite } from "./siteAccess";
import { checkedCountry, countryScope } from "./searchConsoleCountries";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { periodOf } from "./searchConsoleDays";
import { readPeriod } from "./searchConsolePeriodReads";
import { connectionOf } from "./searchConsoleListSources";
import { checkedLongest } from "./searchConsoleLimits";
import { GOOGLE_MOST_ROWS } from "./searchConsoleApi";
import { forEachKeptPart } from "./searchConsoleKeptSums";
import { pageChecksOnFor } from "./searchConsolePageChecks";
import { DAYS_KEPT, dayAfter } from "./utils/pageIndexChecks";
import { isTrackedHold } from "./utils/websitePairing";
import { normalisePage } from "./utils/pageClassification";
import { calendarPeriodValidator, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";
import { byOwnPage, foldPages, reasonBoxes, reasonPages, reasonRows, type FoldedFigures, type ProblemPage } from "./utils/indexingFigures";
import { INDEXING_REASONS, kindOf, reasonSlug } from "./utils/indexingReasons";

/**
 * Search Console → Indexing (search-console-indexing-v1-plan-2026-11-18.md): which of the website's pages are in
 * Google, and why some aren't, from the collector's page checks (`searchConsolePageChecks.ts`), with each reason's
 * clicks and impressions for the dates and the country chosen. Only the problems are read: the pages in Google are a
 * count, kept on the day's row.
 *
 * The figures follow the country menu, as Demand by Classification's do: the main home country's own pages, kept by
 * the collector for each ready-made period (`countryPage`), or a country kept ready's own page list. Another country,
 * other dates, or a period not added up yet are asked of Google when chosen (`searchConsoleLiveIndexing`): one ask.
 * A reason's days come from the days of pages kept (`searchConsoleIndexingDays`), every country's as a page's days are,
 * and ask Google nothing.
 */

/** Pages with a reason read at most, for the summary or one reason. Said in the plan's limits. */
export const MOST_PROBLEMS = 20_000;

const indexingArgs = {
  siteId: v.id("companyWebsites"),
  from: v.string(),
  to: v.string(),
  period: v.optional(calendarPeriodValidator),
  /** One of the website's home countries kept ready beside the main one, Google's code; missing for the main one. */
  country: v.optional(v.string()),
};
type IndexingAsk = { from: string; to: string; period?: CalendarPeriod; country?: string };

const problemOf = (row: Doc<"pageIndexChecks">): ProblemPage => ({
  page: row.page, address: row.address, title: row.title ?? null, reason: row.reason ?? "", crawled: row.crawled, googleCanonical: row.googleCanonical, inSitemap: row.inSitemap, linkedOwn: row.linkedOwn,
});

/** The pages Google gave a reason for, or one reason's: never the pages in Google, nor those Google gave no answer for. */
export async function problemPagesOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, reason?: string): Promise<ProblemPage[]> {
  const rows = reason === undefined
    ? await ctx.db.query("pageIndexChecks").withIndex("by_hold_indexed_reason", (q) => q.eq("companyWebsiteId", holdId).eq("indexed", false).gt("reason", null)).take(MOST_PROBLEMS)
    : await ctx.db.query("pageIndexChecks").withIndex("by_hold_indexed_reason", (q) => q.eq("companyWebsiteId", holdId).eq("indexed", false).eq("reason", reason)).take(MOST_PROBLEMS);
  return rows.filter((row) => row.reason !== null && !row.problem).map(problemOf);
}

/** How far the checks have got: the newest day's whole count, and the website's pages known. Null before any check. */
export const checksValidator = v.object({
  /** Google's day of the newest checks. */
  day: v.string(),
  /** Pages with an answer from Google, those in Google, and those Google gave a reason for. */
  checked: v.number(),
  indexed: v.number(),
  notIndexed: v.number(),
  /** Pages the website's own list knows. */
  known: v.number(),
});
export type ChecksDone = Infer<typeof checksValidator>;

export async function checksDoneOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<ChecksDone | null> {
  const newest = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId)).order("desc").first();
  if (!newest) return null;
  const notIndexed = newest.reasons.reduce((sum, one) => sum + one.pages, 0);
  const checked = newest.indexed + notIndexed;
  return { day: newest.day, checked, indexed: newest.indexed, notIndexed, known: Math.max(newest.known, checked) };
}

/**
 * The website's own pages' figures for the dates and the country chosen, as kept: the main home country's own pages
 * (`countryPage`), or a country kept ready's page list. Null when they must be asked of Google.
 */
export async function keptFigures(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, args: IndexingAsk): Promise<{ from: string; to: string; folded: FoldedFigures } | null> {
  const hold = await ctx.db.get(holdId);
  const connection = await connectionOf(ctx, holdId);
  if (!hold || !connection?.newestDay) return null;
  const scope = await countryScope(ctx, hold, connection, checkedCountry(args.country));
  if (scope.read === "LIVE") return null;
  const period = periodOf(args.from, args.to, scope.read === "KEPT" ? scope.newestDay : connection.newestDay, ukDay(), args.period);
  if (!period) return null;
  const list = scope.read === "KEPT"
    ? await readPeriod(ctx, holdId, "web", "page", period, "NOW", scope.country)
    : await readPeriod(ctx, holdId, "web", "countryPage", period, "NOW");
  if (!list) return null;
  return { from: list.from, to: list.to, folded: foldPages(list.rows) };
}

const reasonFiguresValidator = v.object({ reason: v.string(), clicks: v.number(), impressions: v.number() });
/** A page not in Google that still got clicks in the dates. */
const clickedPageValidator = v.object({ page: v.string(), address: v.string(), title: v.union(v.string(), v.null()), reason: v.string(), clicks: v.number(), impressions: v.number() });
/**
 * Clicks and impressions for the dates: the whole website's pages', each reason's, and the pages not in Google that
 * still got the most clicks.
 */
const figuresValidator = v.object({
  from: v.string(), to: v.string(), clicks: v.number(), impressions: v.number(), byReason: v.array(reasonFiguresValidator), clickedPages: v.array(clickedPageValidator),
});
type Figures = Infer<typeof figuresValidator>;

/** Pages not in Google named with their clicks: the ten with most. */
export const CLICKED_PAGES = 10;

const figuresOf = (from: string, to: string, folded: FoldedFigures, problems: readonly ProblemPage[]): Figures => ({
  from, to, clicks: folded.clicks, impressions: folded.impressions,
  byReason: reasonRows(problems, folded).map((row) => ({ reason: row.reason, clicks: row.clicks, impressions: row.impressions })),
  clickedPages: problems
    .map((page) => ({ page: page.page, address: page.address, title: page.title, reason: page.reason, clicks: folded.byPage.get(page.page)?.clicks ?? 0, impressions: folded.byPage.get(page.page)?.impressions ?? 0 }))
    .filter((page) => page.clicks > 0)
    .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions || left.page.localeCompare(right.page))
    .slice(0, CLICKED_PAGES),
});

/** Google's Page indexing report for the website's property, which counts what apps aren't given. */
export function consoleReportLink(property: string | null): string | null {
  return property ? `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(property)}` : null;
}

export const indexingAnswer = v.object({
  /** The checks may ask Google for this website (`SEARCH_CONSOLE_PAGE_CHECKS`). */
  on: v.boolean(),
  checks: v.union(checksValidator, v.null()),
  /** Each reason, the most pages first: its pages, those a sitemap lists, and the newest day Google visited one. */
  reasons: v.array(v.object({ reason: v.string(), pages: v.number(), inSitemap: v.number(), crawled: v.union(v.string(), v.null()) })),
  /** Each reason's pages a week before the newest checks, once a week of days is kept: for what grew. */
  weekBefore: v.union(v.null(), v.object({ day: v.string(), reasons: v.array(v.object({ reason: v.string(), pages: v.number() })) })),
  /**
   * For the chart, the table over time, as Google's own Page indexing chart draws it (Anthony, 18 November 2026: "its the
   * graph for the table below over time"): each day kept, oldest first, with each reason's pages that day. The days are
   * the ones kept (`DAYS_KEPT`), whatever the dates chosen, as Google's chart shows its last three months.
   */
  days: v.array(v.object({ day: v.string(), reasons: v.array(v.object({ reason: v.string(), pages: v.number() })) })),
  /** The dates' clicks and impressions, as kept; null when asked of Google (`live`). */
  figures: v.union(figuresValidator, v.null()),
  live: v.boolean(),
  report: v.union(v.string(), v.null()),
});
export type IndexingAnswer = Infer<typeof indexingAnswer>;

/** Each reason's pages a week before the newest day's checks: null until a week of days is kept. */
async function weekBeforeOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<IndexingAnswer["weekBefore"]> {
  const newest = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId)).order("desc").first();
  if (!newest) return null;
  const week = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).lte("day", dayAfter(newest.day, -7))).order("desc").first();
  return week ? { day: week.day, reasons: week.reasons } : null;
}

/** Each day's count for each reason, the days kept, oldest first: the chart's bars (`pageIndexDays`, one row a day). */
async function daysOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<IndexingAnswer["days"]> {
  const newest = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId)).order("desc").first();
  if (!newest) return [];
  const rows = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).gt("day", dayAfter(newest.day, -DAYS_KEPT))).take(DAYS_KEPT + 1);
  return rows.map((row) => ({ day: row.day, reasons: row.reasons }));
}

/** The summary, read once for the screen and Ask Hakken. */
export async function readIndexing(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, args: IndexingAsk): Promise<IndexingAnswer> {
  const connection = await connectionOf(ctx, holdId);
  const problems = await problemPagesOf(ctx, holdId);
  const kept = problems.length > 0 ? await keptFigures(ctx, holdId, args) : null;
  return {
    on: pageChecksOnFor(holdId),
    checks: await checksDoneOf(ctx, holdId),
    reasons: reasonRows(problems, null).map((row) => ({
      reason: row.reason, pages: row.pages, inSitemap: problems.filter((page) => page.reason === row.reason && page.inSitemap).length, crawled: row.crawled,
    })),
    weekBefore: await weekBeforeOf(ctx, holdId),
    days: await daysOf(ctx, holdId),
    figures: kept ? figuresOf(kept.from, kept.to, kept.folded, problems) : null,
    live: problems.length > 0 && kept === null && Boolean(connection?.newestDay),
    report: consoleReportLink(connection?.property ?? null),
  };
}

/** Indexing's summary: how far the checks have got, each reason's pages and, kept, their clicks for the dates. */
export const searchConsoleIndexing = tenantQuery({
  args: indexingArgs,
  returns: v.union(v.null(), indexingAnswer),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    return await readIndexing(ctx, site.hold._id, args);
  },
});

const reasonPageValidator = v.object({
  page: v.string(),
  reason: v.string(),
  address: v.string(),
  title: v.union(v.string(), v.null()),
  crawled: v.union(v.string(), v.null()),
  googleCanonical: v.union(v.string(), v.null()),
  inSitemap: v.boolean(),
  linkedOwn: v.boolean(),
  /** The page Google shows in its place is one the checks found in Google. */
  mainIndexed: v.boolean(),
});
const pageFiguresValidator = v.object({ page: v.string(), clicks: v.number(), impressions: v.number() });

export const reasonAnswer = v.object({
  reason: v.string(),
  checks: v.union(checksValidator, v.null()),
  pages: v.array(reasonPageValidator),
  /** The dates' clicks and impressions, the whole website's and each of the reason's pages'; null when asked of Google. */
  figures: v.union(v.object({ from: v.string(), to: v.string(), clicks: v.number(), impressions: v.number(), byPage: v.array(pageFiguresValidator) }), v.null()),
  live: v.boolean(),
});
export type ReasonAnswer = Infer<typeof reasonAnswer>;

const byPageOf = (problems: readonly ProblemPage[], folded: FoldedFigures) =>
  problems.flatMap((page) => { const own = folded.byPage.get(page.page); return own ? [{ page: page.page, clicks: own.clicks, impressions: own.impressions }] : []; });

/** One reason's page, read once for the screen and Ask Hakken. */
export async function readReason(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, reason: string, args: IndexingAsk): Promise<ReasonAnswer> {
  const connection = await connectionOf(ctx, holdId);
  const problems = await problemPagesOf(ctx, holdId, reason);
  const kept = problems.length > 0 ? await keptFigures(ctx, holdId, args) : null;
  const pages = [];
  for (const page of problems) {
    // Where Google sends a page, and whether that one is in Google: only for a page Google shows another in place of.
    const main = page.googleCanonical ? normalisePage(page.googleCanonical) : null;
    const target = main && main !== page.page
      ? await ctx.db.query("pageIndexChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", main)).first()
      : null;
    pages.push({ ...page, mainIndexed: target?.indexed === true });
  }
  return {
    reason,
    checks: await checksDoneOf(ctx, holdId),
    pages,
    figures: kept ? { from: kept.from, to: kept.to, clicks: kept.folded.clicks, impressions: kept.folded.impressions, byPage: byPageOf(problems, kept.folded) } : null,
    live: problems.length > 0 && kept === null && Boolean(connection?.newestDay),
  };
}

/** A reason's own page: its pages, where Google sends each, and, kept, their clicks for the dates. */
export const searchConsoleIndexingReason = tenantQuery({
  args: { ...indexingArgs, reason: v.string() },
  returns: v.union(v.null(), reasonAnswer),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    const { reason, ...ask } = args;
    return await readReason(ctx, site.hold._id, reason, ask);
  },
});

const problemPageValidator = v.object({
  page: v.string(), address: v.string(), title: v.union(v.string(), v.null()), reason: v.string(), crawled: v.union(v.string(), v.null()),
  googleCanonical: v.union(v.string(), v.null()), inSitemap: v.boolean(), linkedOwn: v.boolean(),
});

/** A website's pages with a reason, or one reason's, for an action: only a hold of the caller's company. */
export const problemPagesInternal = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), reason: v.optional(v.string()) },
  returns: v.union(v.null(), v.array(problemPageValidator)),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    return await problemPagesOf(ctx, hold._id, args.reason);
  },
});

const liveAnswer = v.union(
  v.object({
    ok: v.literal(true),
    figures: figuresValidator,
    byPage: v.array(pageFiguresValidator),
    /**
     * The dates' pages stopped at Google's most an ask (`GOOGLE_MOST_ROWS`), the fewest clicks left out: the table says so,
     * as every list asked of Google (review fixes, 18 November 2026).
     */
    cut: v.optional(v.number()),
  }),
  v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
);

/**
 * The website's pages' clicks and impressions asked of Google, for another country, other dates or a period not added
 * up yet: one ask for the dates, the country's filter on (`askLive` filters to the main country itself), each reason's
 * and, for one reason's page, each of its pages'.
 */
export const searchConsoleLiveIndexing = tenantAction({
  args: { ...indexingArgs, reason: v.optional(v.string()) },
  returns: liveAnswer,
  handler: async (ctx, args): Promise<Infer<typeof liveAnswer>> => {
    checkedRange(args.from, args.to);
    const country = checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const problems: ProblemPage[] | null = await ctx.runQuery(internal.searchConsoleIndexing.problemPagesInternal, {
      companyId, siteId: args.siteId, ...(args.reason !== undefined ? { reason: args.reason } : {}),
    });
    if (!problems) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const answer = await askLive(ctx, target, {
      startDate: args.from,
      endDate: args.to,
      type: "web",
      dimensions: ["page"],
      ...(country ? { dimensionFilterGroups: [{ filters: countryFilters(country) }] } : {}),
    });
    if (!answer.ok) return answer;
    const folded = foldPages(answer.rows.map((row) => ({ key: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions })));
    return {
      ok: true as const, figures: figuresOf(args.from, args.to, folded, problems), byPage: args.reason === undefined ? [] : byPageOf(problems, folded),
      ...(answer.rows.length >= GOOGLE_MOST_ROWS ? { cut: GOOGLE_MOST_ROWS } : {}),
    };
  },
});

const daysAnswer = v.union(
  v.object({
    ok: v.literal(true),
    /** The days of pages kept: the first and the newest. */
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    kept: v.number(),
    days: v.array(v.object({ day: v.string(), clicks: v.number(), impressions: v.number() })),
    /** Each of the reason's pages: the last day Google showed it, and on how many of the days kept. */
    pages: v.array(v.object({ page: v.string(), lastShown: v.union(v.string(), v.null()), days: v.number() })),
  }),
  v.object({ ok: v.literal(false), problem: v.literal("NOT_CONNECTED") }),
);

/** The newest day of the website's figures, its country scope's, for the days of pages kept. */
export const keptDaysTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), country: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ newestDay: v.string(), country: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection?.newestDay) return null;
    const scope = await countryScope(ctx, hold, connection, checkedCountry(args.country));
    return scope.read === "KEPT" ? { newestDay: scope.newestDay, country: scope.country } : { newestDay: connection.newestDay, country: null };
  },
});

/**
 * A reason's pages day by day, from the days of pages kept (the last 60 or so: older days are rolled up): each day's
 * clicks and impressions on them, and each page's last day shown and days shown. A country kept ready reads its own;
 * every other choice reads every country's, as a page's days are. Asks Google nothing.
 */
export const searchConsoleIndexingDays = tenantAction({
  args: { siteId: v.id("companyWebsites"), reason: v.string(), country: v.optional(v.string()) },
  returns: daysAnswer,
  handler: async (ctx, args): Promise<Infer<typeof daysAnswer>> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: { newestDay: string; country: string | null } | null = await ctx.runQuery(internal.searchConsoleIndexing.keptDaysTarget, {
      companyId, siteId: args.siteId, ...(args.country ? { country: args.country } : {}),
    });
    const problems: ProblemPage[] | null = await ctx.runQuery(internal.searchConsoleIndexing.problemPagesInternal, { companyId, siteId: args.siteId, reason: args.reason });
    if (!target || !problems) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const wanted = new Set(problems.map((page) => page.page));
    const days = new Map<string, { clicks: number; impressions: number }>();
    const shown = new Map<string, { lastShown: string | null; days: Set<string> }>();
    await forEachKeptPart(ctx, args.siteId, target.country ?? undefined, "web", "page", target.newestDay, (part) => {
      const day = days.get(part.start) ?? { clicks: 0, impressions: 0 };
      days.set(part.start, day);
      part.packed.keys.forEach((key, at) => {
        const page = normalisePage(key);
        if (!wanted.has(page)) return;
        const clicks = part.packed.clicks[at] ?? 0;
        const impressions = part.packed.impressions[at] ?? 0;
        day.clicks += clicks;
        day.impressions += impressions;
        if (impressions <= 0) return;
        const own = shown.get(page) ?? { lastShown: null, days: new Set<string>() };
        own.days.add(part.start);
        if (!own.lastShown || part.start > own.lastShown) own.lastShown = part.start;
        shown.set(page, own);
      });
    });
    const ordered = [...days].sort(([left], [right]) => left.localeCompare(right)).map(([day, figures]) => ({ day, ...figures }));
    return {
      ok: true as const,
      from: ordered[0]?.day ?? null,
      to: ordered.at(-1)?.day ?? null,
      kept: ordered.length,
      days: ordered,
      pages: problems.map((page) => ({ page: page.page, lastShown: shown.get(page.page)?.lastShown ?? null, days: shown.get(page.page)?.days.size ?? 0 })),
    };
  },
});

// ---------------------------------------------------------------------------
// Ask Hakken's read of Indexing (ask-hakken-part-of-every-page)
// ---------------------------------------------------------------------------

/** Pages of a reason an answer names, the most impressions first, as the Examples table opens. */
const ASK_PAGES = 25;

/** The reason a question names: its address on the screen, Google's words, or words in them, among the website's reasons. */
export function reasonAsked(key: string, present: readonly string[]): string | null {
  const wanted = key.trim().toLowerCase();
  if (!wanted) return null;
  const listed = INDEXING_REASONS.find((one) => one.slug === wanted || one.key.toLowerCase() === wanted || one.words.toLowerCase() === wanted);
  if (listed) return listed.words;
  return present.find((words) => words.toLowerCase() === wanted) ?? present.find((words) => words.toLowerCase().includes(wanted)) ?? null;
}

/**
 * Indexing as Ask Hakken reads it, through the very reads the screens make (`readIndexing`, `readReason`): with no
 * `key`, the summary's boxes, how far the checks have got, every reason with its pages, its plain line, its clicks and
 * impressions for the dates, and the pages not in Google that still got clicks; with a `key`, one reason's own page:
 * its four boxes for its kind and its pages. The days of pages kept are read by its screen alone (an action), so a
 * reason's last shown days aren't here. Nothing asks Google.
 */
export async function askIndexing(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, args: IndexingAsk & { key?: string }) {
  const summary = await readIndexing(ctx, holdId, args);
  const checks = summary.checks;
  const notYet = summary.on
    ? "No page of this website has been checked with Google yet: the page checks start tonight, after its nightly update, up to 1,600 pages a day."
    : "No page of this website has been checked with Google yet: the page checks start once they're turned on for it, then run each night, up to 1,600 pages a day.";
  if (!checks) return { checks: null, reasons: [], note: notYet };
  const live = summary.live ? { note: "The clicks for these dates aren't kept: open the screen, which asks Google for them." } : {};
  const describe = (words: string) => {
    const reason = INDEXING_REASONS.find((one) => one.words === words);
    return { reason: words, means: reason?.means ?? null, source: reason ? (reason.source === "website" ? "Website" : "Google systems") : null, kind: kindOf(words) };
  };
  if (args.key) {
    const words = reasonAsked(args.key, summary.reasons.map((one) => one.reason));
    if (!words) return { checks, found: null, reasonsGiven: summary.reasons.map((one) => one.reason), note: `Google gave no reason matching "${args.key}" for the pages checked so far.` };
    const answer = await readReason(ctx, holdId, words, args);
    const folded = answer.figures ? byOwnPage(answer.figures.byPage, answer.figures.clicks, answer.figures.impressions) : null;
    const mains = new Set(answer.pages.filter((page) => page.mainIndexed).map((page) => page.page));
    const pages = reasonPages(answer.pages, folded, () => false).map((page) => ({ ...page, mainIndexed: page.main !== null && mains.has(page.page) }));
    const boxes = reasonBoxes(kindOf(words), pages, { checked: checks.checked, allClicks: answer.figures?.clicks ?? 0, month: `${ukDay().slice(0, 7)}-01`, shown: null });
    return {
      ...live,
      checks,
      ...describe(words),
      link: `indexing/${reasonSlug(words)}`,
      boxes: boxes.filter((box) => box.key !== "lastShown" && box.key !== "stillShown"),
      pagesOfTheReason: pages.length,
      pages: pages.slice(0, ASK_PAGES).map((page) => ({
        page: page.address, title: page.title, clicks: page.clicks, timesShown: page.impressions, lastVisitedByGoogle: page.crawled,
        inSitemap: page.inSitemap, linkedFromOwnPages: page.linkedOwn, ...(page.main ? { googleShowsInstead: page.main, thatPageIsInGoogle: page.mainIndexed } : {}),
      })),
    };
  }
  const byReason = new Map((summary.figures?.byReason ?? []).map((one) => [one.reason, one]));
  return {
    ...live,
    checks,
    clicksOnPagesNotIndexed: summary.figures ? summary.figures.byReason.reduce((sum, one) => sum + one.clicks, 0) : null,
    clicksOnAllPages: summary.figures?.clicks ?? null,
    reasons: summary.reasons.map((one) => ({
      ...describe(one.reason),
      link: `indexing/${reasonSlug(one.reason)}`,
      pages: one.pages,
      pagesInSitemap: one.inSitemap,
      lastVisitedByGoogle: one.crawled,
      clicks: byReason.get(one.reason)?.clicks ?? null,
      timesShown: byReason.get(one.reason)?.impressions ?? null,
    })),
    pagesNotIndexedStillClicked: (summary.figures?.clickedPages ?? []).map((page) => ({ page: page.address, title: page.title, reason: page.reason, clicks: page.clicks, timesShown: page.impressions })),
    reasonsAWeekBefore: summary.weekBefore,
    googlesOwnReport: summary.report,
  };
}
