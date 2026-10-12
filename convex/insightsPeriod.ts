import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { loadSite } from "./websiteSiteRows";
import { featuresOf } from "./utils/rankFacts";
import { RANK_BANDS } from "./utils/siteShapes";
import { beforeOf, heldWhole, openingPeriod, periodById, periodsFrom, yearAgoOf } from "./utils/insightPeriods";
import { whyEnquiriesMoved, type Why } from "./utils/insightWhy";
import {
  SOURCE_GROUPS,
  bestServiceMonth,
  byGroup,
  countingBreak,
  monthsOf,
  pageKindsOf,
  spanFigures,
  whyInputOf,
  type HistoryRecord,
  type MonthFigures,
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

/** History records a website keeps at most (insightHistory.ts). */
const RECORDS_MOST = 100;
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

async function historyOf(ctx: Pick<QueryCtx, "db">, holdId: Id<"companyWebsites">): Promise<HistoryRecord[]> {
  const rows = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", holdId)).take(RECORDS_MOST);
  return rows.map(({ kind, month, from, to, rows: lines }) => ({ kind, month, from, to, rows: lines }));
}

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
    const input = whyInputOf(now, then, {
      rivals: { now: rivalsOver(rivals, chosen.months), then: rivalsOver(rivals, thenMonths) },
      best: bestServiceMonth(months, cut),
      pageOne: rankings ? { now: rankings.pageOne, before: rankings.pageOneBefore } : null,
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
