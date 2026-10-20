import { v } from "convex/values";
import { clarityDays, clarityPeriod } from "./clarity";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { seriesFor } from "./siteFigures";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { loadSite } from "./websiteSiteRows";
import { featuresOf } from "./utils/rankFacts";
import { RANK_BANDS } from "./utils/siteShapes";
import { SOURCE_JOIN } from "./utils/insightHistory";
import { beforeOf, heldWhole, openingPeriod, periodById, periodsFrom, yearAgoOf } from "./utils/insightPeriods";
import { whyEnquiriesMoved, type Why } from "./utils/insightWhy";
import {
  SOURCE_GROUPS,
  bestServiceMonth,
  byGroup,
  countingBreak,
  historyOf,
  listsOf,
  monthsOf,
  pageKindsOf,
  sourceOf,
  spanFigures,
  whyInputOf,
  type HistoryRecord,
  type MonthFigures,
  type PageKind,
  type SourceGroup,
  type SpanFigures,
} from "./insightsPeriodData";

/**
 * Insights by period (docs/plans/active/insights-intelligence-plan.md,
 * phases 1, 7 and 8): the month, quarter or twelve months chosen in the
 * section's header, against the period before and the same period a year
 * ago, from the sixteen months Hakken keeps (insightHistory) — the figures,
 * each kind of page and each source, the months for the charts, and why the
 * enquiries moved. Read when a screen opens from small kept lines; the
 * Analyst's words come from the newest week. Only the caller's own company.
 */

/** Rankings read a band, for the week's snapshot. */
const RANKS_READ = 2_000;

const nullable = v.union(v.number(), v.null());
const trio = v.object({ now: v.number(), before: nullable, yearAgo: nullable });
const periodKind = v.union(v.literal("MONTH"), v.literal("QUARTER"), v.literal("YEAR"));
const compareValidator = v.union(v.literal("YEAR_AGO"), v.literal("BEFORE"));

export const whyValidator = v.object({
  compare: compareValidator,
  lost: v.number(),
  split: v.object({ counting: v.number(), visits: v.number(), rate: v.number() }),
  tests: v.array(v.object({
    id: v.string(),
    verdict: v.string(),
    part: nullable,
    figures: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
    sources: v.array(v.string()),
  })),
  /** The Analyst's words, when the newest week wrote them for this period. */
  paragraph: v.union(v.string(), v.null()),
});

const monthPoint = v.object({
  month: v.string(),
  whole: v.boolean(),
  visits: v.number(),
  enquiries: v.number(),
  people: nullable,
  clicks: nullable,
  shown: nullable,
  position: nullable,
  /** Analytics' visits from Google for each 100 of Google's clicks. */
  share: nullable,
  service: v.object({ visits: v.number(), enquiries: v.number(), clicks: nullable, shown: nullable, position: nullable }),
  groups: v.array(v.object({ group: v.string(), visits: v.number(), enquiries: v.number() })),
  /** The rivals' estimated Google visitors that month, added up (DataForSEO). */
  rivals: nullable,
});

const periodViewValidator = v.object({
  siteId: v.id("companyWebsites"),
  host: v.string(),
  periods: v.array(v.object({ id: v.string(), kind: periodKind })),
  chosen: v.union(v.null(), v.object({ id: v.string(), kind: periodKind, months: v.array(v.string()), before: v.union(v.array(v.string()), v.null()), yearAgo: v.union(v.array(v.string()), v.null()) })),
  figures: v.union(v.null(), v.object({ enquiries: trio, visits: trio, people: v.union(trio, v.null()), rate: trio, clicks: v.union(trio, v.null()), shown: v.union(trio, v.null()) })),
  months: v.array(monthPoint),
  kinds: v.array(v.object({ key: v.string(), name: v.union(v.string(), v.null()), type: v.string(), visits: trio, enquiries: trio })),
  sources: v.array(v.object({ group: v.string(), visits: trio, enquiries: trio })),
  why: v.union(v.null(), whyValidator),
  /** The month Google changed what it counts as shown: times shown and place are not compared across it. */
  breakMonth: v.union(v.string(), v.null()),
});

type Trio = { now: number; before: number | null; yearAgo: number | null };
const trioOf = (now: number, before: number | null | undefined, yearAgo: number | null | undefined): Trio => ({ now, before: before ?? null, yearAgo: yearAgo ?? null });
const rateOf = (span: SpanFigures | null) => (span && span.visits > 0 ? Math.round((span.enquiries * 1000) / span.visits) / 10 : null);
const placeOf = (positionSum: number | null, shown: number | null) => (positionSum !== null && shown ? Math.round((positionSum / shown) * 10) / 10 : null);

/** The rivals' estimated Google visitors a month, from the newest week's market share (DataForSEO). */
function rivalsByMonth(week: Doc<"insightWeeks"> | null): Map<string, number> {
  return new Map((week?.summary?.shareByMonth ?? []).map((month) => [month.month, month.total - month.you]));
}

const rivalsOver = (rivals: ReadonlyMap<string, number>, months: readonly string[] | null) => {
  if (!months || months.some((month) => !rivals.has(month))) return null;
  return months.reduce((sum, month) => sum + (rivals.get(month) ?? 0), 0);
};

/** Whether two spans sit the same side of the month Google changed what it counts as shown. */
const sameSide = (a: readonly string[], b: readonly string[], cut: string | null) => !cut || [...a, ...b].every((month) => month >= cut) || [...a, ...b].every((month) => month < cut);

/** One website's view of a period: every figure, the months, and why. */
export async function periodView(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, host: string, choice: string | undefined) {
  const records = await historyOf(ctx, hold._id);
  const kindOf = await pageKindsOf(ctx, hold._id);
  const months = monthsOf(records, kindOf);
  const whole = new Set(months.filter((month) => month.whole).map((month) => month.month));
  const periods = periodsFrom([...whole]);
  const chosen = periodById(choice, periods) ?? openingPeriod(periods);
  const week = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").first();
  const rivals = rivalsByMonth(week);
  const cut = countingBreak(months);
  const base = {
    siteId: hold._id,
    host,
    periods: periods.map(({ id, kind }) => ({ id, kind })),
    months: months.map((month) => monthPointOf(month, rivals)),
    breakMonth: cut,
  };
  if (!chosen) return { ...base, chosen: null, figures: null, kinds: [], sources: [], why: null };
  const before = heldWhole(beforeOf(chosen), whole) ? beforeOf(chosen) : null;
  const yearAgoMonths = yearAgoOf(chosen);
  const yearAgo = heldWhole(yearAgoMonths, whole) ? yearAgoMonths : null;
  const now = spanFigures(months, chosen.months)!;
  const thenBefore = before ? spanFigures(months, before) : null;
  const thenYear = yearAgo ? spanFigures(months, yearAgo) : null;
  const kinds = [...new Set([...now.kinds.keys(), ...(thenBefore?.kinds.keys() ?? []), ...(thenYear?.kinds.keys() ?? [])])].map((key) => {
    const kind = (now.kinds.get(key) ?? thenBefore?.kinds.get(key) ?? thenYear?.kinds.get(key))!.kind;
    return {
      key,
      name: kind.name,
      type: kind.type,
      visits: trioOf(now.kinds.get(key)?.visits ?? 0, thenBefore ? thenBefore.kinds.get(key)?.visits ?? 0 : null, thenYear ? thenYear.kinds.get(key)?.visits ?? 0 : null),
      enquiries: trioOf(now.kinds.get(key)?.enquiries ?? 0, thenBefore ? thenBefore.kinds.get(key)?.enquiries ?? 0 : null, thenYear ? thenYear.kinds.get(key)?.enquiries ?? 0 : null),
    };
  }).sort((a, b) => b.visits.now - a.visits.now);
  const groupsNow = byGroup(now.sources), groupsBefore = thenBefore ? byGroup(thenBefore.sources) : null, groupsYear = thenYear ? byGroup(thenYear.sources) : null;
  const sources = SOURCE_GROUPS.map((group) => ({
    group,
    visits: trioOf(groupsNow.get(group)?.visits ?? 0, groupsBefore ? groupsBefore.get(group)?.visits ?? 0 : null, groupsYear ? groupsYear.get(group)?.visits ?? 0 : null),
    enquiries: trioOf(groupsNow.get(group)?.enquiries ?? 0, groupsBefore ? groupsBefore.get(group)?.enquiries ?? 0 : null, groupsYear ? groupsYear.get(group)?.enquiries ?? 0 : null),
  })).filter((source) => source.visits.now > 0 || (source.visits.before ?? 0) > 0 || (source.visits.yearAgo ?? 0) > 0);
  const figures = {
    enquiries: trioOf(now.enquiries, thenBefore?.enquiries, thenYear?.enquiries),
    visits: trioOf(now.visits, thenBefore?.visits, thenYear?.visits),
    people: chosen.kind === "MONTH" && now.people !== null ? trioOf(now.people, thenBefore?.people, thenYear?.people) : null,
    rate: trioOf(rateOf(now) ?? 0, rateOf(thenBefore), rateOf(thenYear)),
    clicks: now.clicks !== null ? trioOf(now.clicks, thenBefore?.clicks, thenYear?.clicks) : null,
    shown: now.shown !== null ? trioOf(now.shown, thenBefore?.shown, thenYear?.shown) : null,
  };
  // Why: against the same period a year ago where it is held, else the period before.
  const compare = thenYear ? "YEAR_AGO" as const : thenBefore ? "BEFORE" as const : null;
  const then = thenYear ?? thenBefore;
  const thenMonths = yearAgo ?? before;
  let why: (Why & { compare: "YEAR_AGO" | "BEFORE"; paragraph: string | null }) | null = null;
  if (compare && then && thenMonths) {
    const rankings = week?.summary?.rankings ?? null;
    const kept = await pageOneOver(ctx, hold, chosen.months, thenMonths);
    const input = whyInputOf(now, then, {
      rivals: { now: rivalsOver(rivals, chosen.months), then: rivalsOver(rivals, thenMonths) },
      best: bestServiceMonth(months, cut),
      pageOne: kept ?? (rankings ? { now: rankings.pageOne, before: rankings.pageOneBefore } : null),
      clarity: await clarityBeside(ctx, hold._id, records),
      aiOverviews: rankings ? { with: rankings.aiWith, of: rankings.aiOf } : null,
      shownComparable: sameSide(chosen.months, thenMonths, cut),
    });
    const saved = week?.summary?.why;
    why = { ...whyEnquiriesMoved(input), compare, paragraph: saved && saved.period === chosen.id && saved.compare === compare ? saved.paragraph : null };
  }
  return {
    ...base,
    chosen: { id: chosen.id, kind: chosen.kind, months: chosen.months, before, yearAgo },
    figures,
    kinds,
    sources,
    why,
  };
}

function monthPointOf(month: MonthFigures, rivals: ReadonlyMap<string, number>) {
  let visits = 0, enquiries = 0, clicks = 0, shown = 0, positionSum = 0;
  for (const entry of month.kinds.values()) {
    if (entry.kind.type !== "SERVICE") continue;
    visits += entry.visits;
    enquiries += entry.enquiries;
  }
  for (const entry of month.consoleKinds.values()) {
    if (entry.kind.type !== "SERVICE") continue;
    clicks += entry.clicks;
    shown += entry.impressions;
    positionSum += entry.positionSum;
  }
  const groups = byGroup(month.sources);
  return {
    month: month.month,
    whole: month.whole,
    visits: month.visits,
    enquiries: month.enquiries,
    people: month.people,
    clicks: month.clicks,
    shown: month.shown,
    position: placeOf(month.positionSum, month.shown),
    share: month.googleClicks > 0 ? Math.round((month.googleVisits * 100) / month.googleClicks) : null,
    service: { visits, enquiries, clicks: month.consoleKinds.size > 0 ? clicks : null, shown: month.consoleKinds.size > 0 ? shown : null, position: placeOf(positionSum, shown) },
    groups: SOURCE_GROUPS.map((group) => ({ group, visits: groups.get(group)?.visits ?? 0, enquiries: groups.get(group)?.enquiries ?? 0 })),
    rivals: rivals.get(month.month) ?? null,
  };
}

/** The website a company-wide read shows: the one chosen, or its first owned website holding a history. */
async function siteFor(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<{ hold: Doc<"companyWebsites">; host: string } | null> {
  if (!ctx.companyId) return null;
  if (siteId) await requireMySite(ctx, siteId);
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED" && (!siteId || entry.hold._id === siteId));
  for (const entry of owned) {
    const any = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", entry.hold._id)).first();
    if (any) return { hold: entry.hold, host: entry.summary.host };
  }
  return owned[0] ? { hold: owned[0].hold, host: owned[0].summary.host } : null;
}

/** What a screen reads for the period chosen in the section's header (`period`: `2026-09`, `2026-Q3` or `12M`). */
export const insightsPeriodView = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")), period: v.optional(v.string()) },
  returns: v.union(v.null(), periodViewValidator),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    return site ? await periodView(ctx, site.hold, site.host, args.period) : null;
  },
});

/** Days of Clarity read beside Analytics: the last month of mornings; a witness needs a week of them. */
const CLARITY_DAYS_READ = 31;
const CLARITY_LEAST_DAYS = 7;

/**
 * DataForSEO's searches on page one at the end of two spans, from the weekly
 * readings kept with the website's days (`siteDaySummaries`; insights-
 * intelligence-plan.md phase 10): the last reading in each span's last month,
 * all the searches it ranks for. Null when either month has no reading.
 */
async function pageOneOver(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, now: readonly string[], then: readonly string[]): Promise<{ now: number; before: number; months: { now: string; then: string } } | null> {
  const place = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const atEnd = async (months: readonly string[]) => {
    const month = months[months.length - 1];
    const points = await seriesFor(ctx, hold.websiteId, place, `${month}-01`, `${month}-31`, "month");
    const bands = points.at(-1)?.allBands ?? points.at(-1)?.bands;
    return bands ? (bands.p01_03 ?? 0) + (bands.p04_10 ?? 0) : null;
  };
  const [pageOneNow, pageOneThen] = [await atEnd(now), await atEnd(then)];
  return pageOneNow !== null && pageOneThen !== null ? { now: pageOneNow, before: pageOneThen, months: { now: now[now.length - 1], then: then[then.length - 1] } } : null;
}

/**
 * Microsoft Clarity's visits against Analytics' on the days both hold, the
 * last month (phase 10): a second witness to whether Analytics counts
 * everyone. Null until they share a week of days Clarity was recording.
 */
async function clarityBeside(ctx: Pick<QueryCtx, "db">, holdId: Id<"companyWebsites">, records: readonly HistoryRecord[]): Promise<{ clarity: number; analytics: number; days: number } | null> {
  // The website's visits a day, from last month and this month as worked out each morning (calendar-periods-plan.md, phase 3): by people, bots left out.
  const [lastMonth, thisMonth] = [await clarityPeriod(ctx, holdId, "lastMonth", false), await clarityPeriod(ctx, holdId, "thisMonth", false)];
  const days = [...(lastMonth ? clarityDays(lastMonth.first) : []), ...(thisMonth ? clarityDays(thisMonth.first) : [])].slice(-CLARITY_DAYS_READ);
  const analytics = new Map((records.find((record) => record.kind === "DAYS")?.rows ?? []).map((row) => [row.key, row.visits ?? 0]));
  let clarity = 0, counted = 0, shared = 0;
  for (const { day, totals } of days) {
    const sessions = totals.visits;
    // A morning Clarity counted nobody it wasn't recording yet (connected that day): not a day it disagrees.
    if (!analytics.has(day) || sessions === 0) continue;
    clarity += sessions;
    counted += analytics.get(day) ?? 0;
    shared += 1;
  }
  return shared >= CLARITY_LEAST_DAYS ? { clarity, analytics: counted, days: shared } : null;
}

/** For the weekly run: the newest whole month's view, for the Analyst and the facts. */
export const runView = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), periodViewValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    return hold && website ? await periodView(ctx, hold, website.displayHost ?? website.host, undefined) : null;
  },
});

/**
 * DataForSEO's rankings this week against the week before, for the six tests:
 * the searches on page one now and then, and how many of today's page-one
 * searches show Google's AI overview. Read by the weekly run and kept with
 * the week.
 */
export const rankSnapshot = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ day: v.string(), pageOne: v.number(), pageOneBefore: v.number(), aiWith: v.number(), aiOf: v.number() })),
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.holdId);
    if (!site) return null;
    let pageOne = 0, pageOneBefore = 0, aiWith = 0, day = "";
    for (const band of RANK_BANDS) {
      const rows = await ctx.db.query("siteKeywordRanks")
        .withIndex("by_site_band_position", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("band", band))
        .take(RANKS_READ);
      for (const row of rows) {
        if (row.day > day) day = row.day;
        const now = row.status !== "LOST" && row.position !== undefined && row.position <= 10;
        if (now) {
          pageOne += 1;
          if (featuresOf(row.serpFeatures).includes("ai_overview")) aiWith += 1;
        }
        if (row.previousPosition !== undefined && row.previousPosition <= 10) pageOneBefore += 1;
      }
    }
    return day ? { day, pageOne, pageOneBefore, aiWith, aiOf: pageOne } : null;
  },
});

/** Rows a list on What brings enquiries shows at most: the most first. */
const ENQUIRY_ROWS = 150;
/** A search's estimate is fairly sure when its page had this many enquiries from Google and the search this part of its clicks. */
const SURE_ENQUIRIES = 3;
const SURE_SHARE = 0.25;
/** The groups a page's enquiries are split by on screen; the rest are added up as OTHER. */
const PAGE_GROUPS = ["GOOGLE", "AI", "TYPED"] as const;

function fromGroups(groups: ReadonlyMap<SourceGroup, { visits: number; enquiries: number }> | undefined) {
  const out = { GOOGLE: 0, AI: 0, TYPED: 0, OTHER: 0 };
  for (const [group, entry] of groups ?? []) {
    const key = (PAGE_GROUPS as readonly string[]).includes(group) ? (group as (typeof PAGE_GROUPS)[number]) : "OTHER";
    out[key] += entry.enquiries;
  }
  return out;
}

const trioOfMaps = <T,>(key: string, now: ReadonlyMap<string, T>, before: ReadonlyMap<string, T> | null, year: ReadonlyMap<string, T> | null, value: (entry: T | undefined) => number): Trio =>
  trioOf(value(now.get(key)), before ? value(before.get(key)) : null, year ? value(year.get(key)) : null);

/**
 * What brings enquiries (insights-intelligence-plan.md phase 2, drawn and
 * approved 12 Oct): the period chosen, against the period before and a year
 * ago — each kind of page month by month, each source by its own name, each
 * kind of enquiry, each page with its share from Google, the pages read on the
 * way to an enquiry, and the searches behind the pages, estimated.
 */
export async function enquiriesView(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, host: string, choice: string | undefined) {
  const records = await historyOf(ctx, hold._id);
  const kindOf = await pageKindsOf(ctx, hold._id);
  const months = monthsOf(records, kindOf);
  const whole = new Set(months.filter((month) => month.whole).map((month) => month.month));
  const periods = periodsFrom([...whole]);
  const chosen = periodById(choice, periods) ?? openingPeriod(periods);
  if (!chosen) return null;
  const before = heldWhole(beforeOf(chosen), whole) ? beforeOf(chosen) : null;
  const yearAgoMonths = yearAgoOf(chosen);
  const yearAgo = heldWhole(yearAgoMonths, whole) ? yearAgoMonths : null;
  const lists = listsOf(records, kindOf);
  const over = (span: readonly string[] | null) => (span ? lists.over(span) : null);
  const now = over(chosen.months)!, then = over(before), year = over(yearAgo);
  const visitsOf = (entry: { visits: number } | undefined) => entry?.visits ?? 0;
  const enquiriesOf = (entry: { enquiries: number } | undefined) => entry?.enquiries ?? 0;
  const timesOf = (entry: { times: number } | undefined) => entry?.times ?? 0;
  const sources = [...now.sources.keys()].map((key) => ({
    key,
    ...sourceOf(key),
    visits: trioOfMaps(key, now.sources, then?.sources ?? null, year?.sources ?? null, visitsOf),
    enquiries: trioOfMaps(key, now.sources, then?.sources ?? null, year?.sources ?? null, enquiriesOf),
  })).sort((a, b) => b.visits.now - a.visits.now).slice(0, ENQUIRY_ROWS);
  const events = [...new Set([...now.events.keys(), ...(then?.events.keys() ?? []), ...(year?.events.keys() ?? [])])].map((name) => ({
    name,
    counted: [now, then, year].some((span) => (span?.events.get(name)?.enquiries ?? 0) > 0),
    times: trioOfMaps(name, now.events, then?.events ?? null, year?.events ?? null, timesOf),
    enquiries: trioOfMaps(name, now.events, then?.events ?? null, year?.events ?? null, enquiriesOf),
  })).sort((a, b) => Number(b.counted) - Number(a.counted) || b.times.now - a.times.now);
  const pages = [...now.pages.keys()].map((path) => {
    const kind = kindOf(path);
    return {
      path,
      kind: kind.name,
      type: kind.type,
      visits: trioOfMaps(path, now.pages, then?.pages ?? null, year?.pages ?? null, visitsOf),
      enquiries: trioOfMaps(path, now.pages, then?.pages ?? null, year?.pages ?? null, enquiriesOf),
      // Where the page's enquiries came from (insights-intelligence-plan.md phase 2, "every page … split by where
      // people came from"): Google, AI assistants, typed in, and every other source together.
      from: fromGroups(now.pagesByGroup.get(path)),
    };
  }).sort((a, b) => b.enquiries.now - a.enquiries.now || b.visits.now - a.visits.now).slice(0, ENQUIRY_ROWS);
  const journeyRecord = records.find((record) => record.kind === "GA_JOURNEY");
  const journey = journeyRecord
    ? {
      from: journeyRecord.from,
      to: journeyRecord.to,
      rows: journeyRecord.rows.filter((row) => (row.enquiries ?? 0) > 0).map((row) => ({ path: row.key, kind: kindOf(row.key).name, visits: row.visits ?? 0, enquiries: row.enquiries ?? 0 }))
        .sort((a, b) => b.enquiries - a.enquiries).slice(0, ENQUIRY_ROWS),
    }
    : null;
  // Each search's enquiries, estimated (Google never says which search led to one): the page's enquiries from Google
  // over the newest three whole months, shared out by each search's part of the page's clicks — all its clicks, so the
  // searches Google keeps private keep their share and one named click never takes a page's every enquiry.
  const searchRecord = records.find((record) => record.kind === "SC_SEARCH_PAGES");
  const recent = [...whole].sort().slice(-3);
  const fromGoogle = lists.over(recent).googleByPage;
  const consoleClicks = new Map<string, number>();
  for (const record of records) {
    if (record.kind !== "SC_PAGES" || !recent.includes(record.month)) continue;
    for (const row of record.rows) consoleClicks.set(row.key, (consoleClicks.get(row.key) ?? 0) + (row.clicks ?? 0));
  }
  const googleOf = (page: string) => fromGoogle.get(page) ?? fromGoogle.get(page.endsWith("/") && page !== "/" ? page.slice(0, -1) : `${page}/`);
  const pairs = (searchRecord?.rows ?? []).map((row) => {
    const [search = "", page = ""] = row.key.split(SOURCE_JOIN);
    return { search, page, clicks: row.clicks ?? 0 };
  }).filter((pair) => pair.search && pair.page && pair.clicks > 0);
  const pageClicks = new Map<string, number>();
  for (const pair of pairs) pageClicks.set(pair.page, (pageClicks.get(pair.page) ?? 0) + pair.clicks);
  for (const [page, clicks] of pageClicks) pageClicks.set(page, Math.max(clicks, consoleClicks.get(page) ?? 0));
  const estimated = pairs.map((pair) => {
    const enquiries = googleOf(pair.page)?.enquiries ?? 0;
    const total = pageClicks.get(pair.page) ?? 0;
    const share = total > 0 ? pair.clicks / total : 0;
    return {
      search: pair.search, page: pair.page, kind: kindOf(pair.page).name, clicks: pair.clicks,
      estimate: Math.round(enquiries * share * 10) / 10,
      // How sure: a page with a few enquiries from Google, and a search taking a good part of its clicks.
      sure: enquiries >= SURE_ENQUIRIES && share >= SURE_SHARE,
      pageEnquiries: enquiries,
    };
  });
  const searches = estimated.filter((row) => row.pageEnquiries > 0)
    .sort((a, b) => b.estimate - a.estimate || b.clicks - a.clicks).slice(0, ENQUIRY_ROWS)
    .map(({ pageEnquiries: _, ...row }) => row);
  // The searches that bring clicks to pages Google sent no enquiries from: the most clicks first.
  const noEnquiries = estimated.filter((row) => row.pageEnquiries === 0)
    .sort((a, b) => b.clicks - a.clicks).slice(0, ENQUIRY_ROWS)
    .map(({ search, page, kind, clicks }) => ({ search, page, kind, clicks }));
  const byMonth = [...whole].sort().map((month) => {
    const one = lists.over([month]);
    return {
      month,
      kinds: [...one.kinds.entries()].map(([key, entry]) => ({ key, visits: entry.visits, enquiries: entry.enquiries })),
      events: [...one.events.entries()].filter(([, entry]) => entry.enquiries > 0).map(([name, entry]) => ({ name, enquiries: entry.enquiries })),
    };
  });
  return { siteId: hold._id, host, chosen: { id: chosen.id, kind: chosen.kind, months: chosen.months, before, yearAgo }, sources, events, pages, journey, searches, noEnquiries, byMonth };
}

const sourceGroupValidator = v.union(...SOURCE_GROUPS.map((group) => v.literal(group)));
/** A page's classification type — a key of System Settings → Classification's list — or NOT_SORTED / NOT_RECORDED. */
const kindType = v.string();
const chosenValidator = v.object({ id: v.string(), kind: periodKind, months: v.array(v.string()), before: v.union(v.null(), v.array(v.string())), yearAgo: v.union(v.null(), v.array(v.string())) });

/** What brings enquiries: the period chosen in the section's header, for the website chosen. */
export const insightsEnquiries = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")), period: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    chosen: chosenValidator,
    sources: v.array(v.object({ key: v.string(), group: sourceGroupValidator, name: v.string(), visits: trio, enquiries: trio })),
    events: v.array(v.object({ name: v.string(), counted: v.boolean(), times: trio, enquiries: trio })),
    pages: v.array(v.object({
      path: v.string(), kind: v.union(v.string(), v.null()), type: kindType, visits: trio, enquiries: trio,
      from: v.object({ GOOGLE: v.number(), AI: v.number(), TYPED: v.number(), OTHER: v.number() }),
    })),
    journey: v.union(v.null(), v.object({ from: v.string(), to: v.string(), rows: v.array(v.object({ path: v.string(), kind: v.union(v.string(), v.null()), visits: v.number(), enquiries: v.number() })) })),
    searches: v.array(v.object({ search: v.string(), page: v.string(), kind: v.union(v.string(), v.null()), clicks: v.number(), estimate: v.number(), sure: v.boolean() })),
    noEnquiries: v.array(v.object({ search: v.string(), page: v.string(), kind: v.union(v.string(), v.null()), clicks: v.number() })),
    byMonth: v.array(v.object({
      month: v.string(),
      kinds: v.array(v.object({ key: v.string(), visits: v.number(), enquiries: v.number() })),
      events: v.array(v.object({ name: v.string(), enquiries: v.number() })),
    })),
  })),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    return site ? await enquiriesView(ctx, site.hold, site.host, args.period) : null;
  },
});

/**
 * One source's enquiries, by its own name (Anthony, 2026-10-12: "which
 * assistant or Google brought those enquiries … a detail click-through
 * page"): its visits and enquiries month by month, the period chosen against
 * the period before and a year ago, and the kinds of page and pages it sent
 * people to.
 */
export async function enquirySourceView(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, name: string, choice: string | undefined) {
  const records = await historyOf(ctx, hold._id);
  const kindOf = await pageKindsOf(ctx, hold._id);
  const months = monthsOf(records, kindOf);
  const whole = new Set(months.filter((month) => month.whole).map((month) => month.month));
  const chosen = periodById(choice, periodsFrom([...whole])) ?? openingPeriod(periodsFrom([...whole]));
  if (!chosen) return null;
  const before = heldWhole(beforeOf(chosen), whole) ? beforeOf(chosen) : null;
  const yearAgoMonths = yearAgoOf(chosen);
  const yearAgo = heldWhole(yearAgoMonths, whole) ? yearAgoMonths : null;
  const lists = listsOf(records, kindOf);
  // A source's name gathers its keys: Google Analytics may name one source under more than one channel.
  const figuresOver = (span: readonly string[] | null) => {
    if (!span) return null;
    const over = lists.over(span);
    let visits = 0, enquiries = 0, group: SourceGroup | null = null;
    for (const [key, entry] of over.sources) {
      const source = sourceOf(key);
      if (source.name !== name) continue;
      visits += entry.visits;
      enquiries += entry.enquiries;
      group ??= source.group;
    }
    return { visits, enquiries, group, pages: over.pagesBySource.get(name) ?? new Map<string, { visits: number; enquiries: number }>() };
  };
  const now = figuresOver(chosen.months)!, then = figuresOver(before), year = figuresOver(yearAgo);
  const monthly = [...whole].sort().map((month) => {
    const one = figuresOver([month])!;
    return { month, visits: one.visits, enquiries: one.enquiries, group: one.group };
  });
  const group = now.group ?? monthly.find((month) => month.group)?.group ?? null;
  if (!group) return { chosen: null };
  const kinds = new Map<string, { name: string | null; type: PageKind["type"]; visits: number; enquiries: number }>();
  for (const [path, entry] of now.pages) {
    const kind = kindOf(path);
    const held = kinds.get(kind.key) ?? { name: kind.name, type: kind.type, visits: 0, enquiries: 0 };
    held.visits += entry.visits;
    held.enquiries += entry.enquiries;
    kinds.set(kind.key, held);
  }
  return {
    chosen: { id: chosen.id, kind: chosen.kind, months: chosen.months, before, yearAgo },
    group,
    figures: {
      visits: trioOf(now.visits, then?.visits, year?.visits),
      enquiries: trioOf(now.enquiries, then?.enquiries, year?.enquiries),
    },
    months: monthly.map(({ month, visits, enquiries }) => ({ month, visits, enquiries })),
    kinds: [...kinds.entries()].map(([key, entry]) => ({ key, ...entry })).sort((a, b) => b.visits - a.visits),
    pages: [...now.pages.entries()].map(([path, entry]) => ({ path, kind: kindOf(path).name, visits: entry.visits, enquiries: entry.enquiries }))
      .sort((a, b) => b.enquiries - a.enquiries || b.visits - a.visits).slice(0, ENQUIRY_ROWS),
  };
}

/** One source's page under What brings enquiries. */
export const insightsEnquirySource = tenantQuery({
  args: { name: v.string(), siteId: v.optional(v.id("companyWebsites")), period: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ chosen: v.null() }), v.object({
    chosen: chosenValidator,
    group: sourceGroupValidator,
    figures: v.object({ visits: trio, enquiries: trio }),
    months: v.array(v.object({ month: v.string(), visits: v.number(), enquiries: v.number() })),
    kinds: v.array(v.object({ key: v.string(), name: v.union(v.string(), v.null()), type: kindType, visits: v.number(), enquiries: v.number() })),
    pages: v.array(v.object({ path: v.string(), kind: v.union(v.string(), v.null()), visits: v.number(), enquiries: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    return site ? await enquirySourceView(ctx, site.hold, args.name, args.period) : null;
  },
});
