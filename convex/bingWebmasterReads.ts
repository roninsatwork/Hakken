import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { websiteIconUrl } from "./websiteIcons";
import { appError } from "./utils/appError";
import { getActiveCompanyId } from "./authz";
import { normalisePage } from "./utils/pageClassification";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { listOrder, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { unpackNumbers } from "./utils/searchConsolePacks";
import { bingKeywordsAt, wholeBingBookInQuery } from "./bingWebmasterBook";
import { bingStatusValidator } from "./bingWebmasterSchema";
import { OPENING_PERIOD, customSpans, periodSpan, spanBefore, ukDay } from "./utils/calendarPeriods";
import { bingPeriodArgValidator, bingPeriodKey, type BingPeriodArg } from "./bingWebmasterSchema";
import { accessTokenFor } from "./bingWebmasterConnect";
import { keywordPages, pageKeywords } from "./bingWebmasterApi";
import { addUpRows, keywordMatch, pageNumberOf, pageRefOf, positionOfRow, rowsOfBingPart, shiftBingDay, type BingRow } from "./utils/bingWebmasterWeeks";
import { bandOf, beforeIsWhole, bingListSeen as wholeListOf, namedListSeen, pageNameOf, seenNumbers, whoRanksHigher } from "./utils/bingWebmasterSeen";

export { whoRanksHigher };

/**
 * What the Bing Webmaster screens read (docs/plans/active/bing-webmaster-plan.md
 * §5): every read through the caller's own hold (BW7), from the days, weeks
 * and ready-made lists the collection keeps — nothing added up from Bing's
 * weeks while a screen loads but a keyword's or a page's own weeks.
 *
 * Every figure comes with Google's for the same days or the same keyword
 * (BW10): Google's are the website's main home country's web results, as
 * Search Console's own screens open, while Bing's cover every country, since
 * Bing does not split them.
 */

const orNull = <T extends ReturnType<typeof v.number>>(validator: T) => v.union(validator, v.null());

/** The weeks a keyword's or a page's own screen draws: its last six months. */
const RECORD_WEEKS = 26;

type DayTotals = { clicks: number; impressions: number };

async function connectionOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">) {
  return await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
}

async function bingDaysBetween(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, from: string, to: string) {
  return await ctx.db
    .query("bingDays")
    .withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).gte("day", from).lte("day", to))
    .take(800);
}

/** Google's web clicks and impressions for the website's main home country, a day at a time, as Search Console keeps them. */
async function googleDaysBetween(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, from: string, to: string) {
  return await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", holdId).eq("country", undefined).eq("searchType", "web").gte("day", from).lte("day", to))
    .take(800);
}

const total = (rows: readonly { clicks?: number; impressions?: number }[]): DayTotals =>
  rows.reduce<DayTotals>((sum, row) => ({ clicks: sum.clicks + (row.clicks ?? 0), impressions: sum.impressions + (row.impressions ?? 0) }), { clicks: 0, impressions: 0 });

/** The share of a website's clicks from search that came from Bing, as a fraction; null with no clicks on either. */
const shareOf = (bing: number, google: number | null) => (google === null || bing + google === 0 ? null : bing / (bing + google));

// ---------------------------------------------------------------------------
// The websites
// ---------------------------------------------------------------------------

/** The company's own websites in the Bing Webmaster section: each with last month on Bing, beside Google's (calendar-periods-plan.md, rule 7). */
export const bingSites = tenantQuery({
  args: {},
  returns: v.array(v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    iconUrl: v.union(v.string(), v.null()),
    status: v.union(bingStatusValidator, v.literal("NOT_CONNECTED")),
    clicks: orNull(v.number()),
    impressions: orNull(v.number()),
    googleClicks: orNull(v.number()),
    share: orNull(v.number()),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    lastCollectedAt: orNull(v.number()),
  })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    const out = [];
    for (const entry of holds) {
      const holdId = entry.summary.siteId;
      const connection = await connectionOf(ctx, holdId);
      const hold = await ctx.db.get(holdId);
      const span = connection?.newestDay ? periodSpan(OPENING_PERIOD, ukDay(), connection.newestDay) : null;
      const from = span?.from ?? null;
      const newest = span?.to ?? null;
      const bing = span ? total(await bingDaysBetween(ctx, holdId, span.from, span.to)) : null;
      const google = span ? total(await googleDaysBetween(ctx, holdId, span.from, span.to)) : null;
      out.push({
        siteId: holdId,
        host: entry.summary.host,
        iconUrl: hold ? await websiteIconUrl(ctx, hold.websiteId) : null,
        status: connection?.status ?? ("NOT_CONNECTED" as const),
        clicks: bing?.clicks ?? null,
        impressions: bing?.impressions ?? null,
        googleClicks: google?.clicks ?? null,
        share: bing ? shareOf(bing.clicks, google?.clicks ?? null) : null,
        from,
        to: newest,
        lastCollectedAt: connection?.lastCollectedAt ?? null,
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/** The Monday a day's week starts on: Bing's and Google's clicks are compared week by week. */
function weekOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return shiftBingDay(day, -((date.getUTCDay() + 6) % 7));
}

/**
 * The days of a calendar period Bing's day totals hold: from its first day to Bing's newest, never past its end. Null
 * while Bing has sent none of it (rule 9) or nothing at all.
 */
function daysOfPeriod(newestDay: string | undefined, period: BingPeriodArg): { from: string; to: string } | null {
  if (!newestDay) return null;
  if (typeof period === "string") return periodSpan(period, ukDay(), newestDay);
  // Custom dates, cut at Bing's newest day.
  const to = period.to < newestDay ? period.to : newestDay;
  return period.from <= to ? { from: period.from, to } : null;
}

/**
 * The span a period's days are set against (calendar-periods-plan.md, rule 4): the period before, whole or its same
 * days; custom dates, the same number of days straight before. Null where Bing's days don't reach back to its first day,
 * so a part of a span is never read as the whole of it (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7: "the
 * span before (held, not read)").
 */
function daysBefore(period: BingPeriodArg, span: { from: string; to: string; whole?: boolean }, oldestDay: string | undefined): { from: string; to: string } | null {
  const before = typeof period === "string" ? spanBefore(period, { from: span.from, to: span.to, whole: span.whole ?? true }) : customSpans(span.from, span.to).before;
  return oldestDay && oldestDay <= before.from ? { from: before.from, to: before.to } : null;
}

const hasTotals = (day: Doc<"bingDays">) => day.clicks !== undefined || day.impressions !== undefined;
const daysIn = (span: { from: string; to: string }) => Math.round((Date.parse(`${span.to}T00:00:00Z`) - Date.parse(`${span.from}T00:00:00Z`)) / 86_400_000) + 1;
/** A span before holding fewer of its days than this share is a part of one. */
const WHOLE_DAYS = 0.9;

/** Performance's figures for a website over a calendar period: the screen and Ask Hakken read them alike. */
export async function readPerformance(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, period: BingPeriodArg) {
  const connection = await connectionOf(ctx, holdId);
  const span = daysOfPeriod(connection?.newestDay, period);
  if (!span) return null;
  const { from, to } = span;
  const bing = await bingDaysBetween(ctx, holdId, from, to);
  const google = await googleDaysBetween(ctx, holdId, from, to);
  const days = bing.filter(hasTotals)
    .map((day) => ({ day: day.day, clicks: day.clicks ?? 0, impressions: day.impressions ?? 0 }));
  // The span before's totals, Bing's and Google's, for the eye to set this span against (they were held, never read).
  const spanOf = daysBefore(period, span, connection?.oldestDay);
  const bingBefore = spanOf ? (await bingDaysBetween(ctx, holdId, spanOf.from, spanOf.to)).filter(hasTotals) : [];
  const googleBefore = spanOf ? await googleDaysBetween(ctx, holdId, spanOf.from, spanOf.to) : [];
  // Google's span before only where Search Console holds nearly every day of it: More Handles' days begin 23 April 2026
  // (checked 2026-11-04), so Last 6 months' span before holds ten days of Google's, and a change on them would be a
  // tenfold rise that never happened.
  const before = spanOf && bingBefore.length > 0
    ? { from: spanOf.from, to: spanOf.to, totals: total(bingBefore), google: googleBefore.length >= daysIn(spanOf) * WHOLE_DAYS ? total(googleBefore) : null }
    : null;
  const weeks = new Map<string, { bing: number; google: number }>();
  for (const day of days) {
    const week = weeks.get(weekOf(day.day)) ?? { bing: 0, google: 0 };
    week.bing += day.clicks;
    weeks.set(weekOf(day.day), week);
  }
  for (const day of google) {
    const week = weeks.get(weekOf(day.day));
    if (week) week.google += day.clicks;
  }
  return {
    from,
    to,
    days,
    totals: total(days),
    google: google.length > 0 ? total(google) : null,
    weeks: [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([week, figures]) => ({ week, bing: figures.bing, google: google.length > 0 ? figures.google : null })),
    before,
  };
}

/** Bing's and Google's clicks and impressions over a span: a period's totals, or the span before's. */
const totalsValidator = v.object({ clicks: v.number(), impressions: v.number() });

/**
 * The website's clicks and impressions on Bing day by day, for chosen days
 * ending on Bing's newest, beside Google's for the same days, and week by
 * week Bing's share of the clicks from both.
 */
export const bingPerformance = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: bingPeriodArgValidator },
  returns: v.union(v.null(), v.object({
    from: v.string(),
    to: v.string(),
    days: v.array(v.object({ day: v.string(), clicks: v.number(), impressions: v.number() })),
    totals: totalsValidator,
    google: v.union(v.null(), totalsValidator),
    weeks: v.array(v.object({ week: v.string(), bing: v.number(), google: v.union(v.number(), v.null()) })),
    /** The span before: its days, Bing's totals and Google's; null where Bing's days don't reach back to it. */
    before: v.union(v.null(), v.object({ from: v.string(), to: v.string(), totals: totalsValidator, google: v.union(v.null(), totalsValidator) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await readPerformance(ctx, site.hold._id, args.period);
  },
});

// ---------------------------------------------------------------------------
// The keyword and page lists
// ---------------------------------------------------------------------------

/** A row of a list as the screens show it: Bing's figures, then Google's for the same keyword or page. */
const shownRowValidator = v.object({
  key: v.string(),
  /** A keyword's place in the website's Bing book, or a page's reference in its page numbering ("~1a"): its own screen's address. */
  ref: v.string(),
  title: v.union(v.string(), v.null()),
  clicks: v.number(),
  impressions: v.number(),
  ctr: orNull(v.number()),
  position: orNull(v.number()),
  googleClicks: orNull(v.number()),
  googleImpressions: orNull(v.number()),
  googlePosition: orNull(v.number()),
});

type ListRow = {
  number: number;
  /** Its place in the list's A to Z order by name, worked out at the build (§4.5). */
  rank: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  googleClicks: number | null;
  googleImpressions: number | null;
  googlePosition: number | null;
};

const SORTS: ListSorts<ListRow, "name" | "clicks" | "impressions" | "ctr" | "position" | "googleClicks" | "googlePosition" | "gap"> = {
  // A to Z by the place the build gave each name, so no list reads its words to sort.
  name: { value: (row) => row.rank, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  googleClicks: { value: (row) => row.googleClicks, first: "desc" },
  googlePosition: { value: (row) => row.googlePosition, first: "asc" },
  // How many places higher Bing ranks the website than Google: the most first.
  gap: { value: (row) => (row.position === null || row.googlePosition === null ? null : row.googlePosition - row.position), first: "desc" },
};

/** A row's name for the sort's ties: its A to Z place, as text that sorts in number order. */
const rankName = (row: ListRow) => String(row.rank).padStart(9, "0");

const listArgs = {
  siteId: v.id("companyWebsites"),
  list: v.union(v.literal("query"), v.literal("page")),
  period: bingPeriodArgValidator,
  q: v.optional(v.string()),
  /** Position band, as Search Console's: "top3", "top10", "top20", "rest". */
  band: v.optional(v.string()),
  /** On Google too, or only on Bing. */
  google: v.optional(v.union(v.literal("both"), v.literal("onlyBing"))),
  /** Who ranks the website higher: Bing, Google, or only Bing shows it (Bing against Google). */
  who: v.optional(v.union(v.literal("BING"), v.literal("GOOGLE"), v.literal("ONLY_BING"))),
  /** Pages only: one of the website's classifications, or Not sorted (as drawn, board 5). */
  kind: v.optional(v.string()),
  sort: v.optional(v.union(...Object.keys(SORTS).map((key) => v.literal(key as keyof typeof SORTS)))),
  direction: sortDirectionArg,
};

/** A ready-made list's parts, the newest build's only. */
async function periodParts(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", period: BingPeriodArg, which: "NOW" | "BEFORE" = "NOW") {
  const parts = await ctx.db
    .query("bingPeriods")
    .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("period", bingPeriodKey(period)).eq("which", which))
    .take(200);
  const newest = Math.max(0, ...parts.map((part) => part.builtAt));
  return parts.filter((part) => part.builtAt === newest).sort((left, right) => left.part - right.part);
}

function rowsOfParts(parts: readonly Doc<"bingPeriods">[]): ListRow[] {
  const rows: ListRow[] = [];
  for (const part of parts) {
    const figures = rowsOfBingPart(part);
    const googleClicks = part.googleClicks ? unpackNumbers(part.googleClicks) : null;
    const googleImpressions = part.googleImpressions ? unpackNumbers(part.googleImpressions) : null;
    const googleSums = part.googlePositionSums ? unpackNumbers(part.googlePositionSums) : null;
    const ranks = part.nameRanks ? unpackNumbers(part.nameRanks) : null;
    for (const [index, row] of figures.entries()) {
      const gClicks = googleClicks?.[index] ?? -1;
      const gImpressions = googleImpressions?.[index] ?? -1;
      const gSum = googleSums?.[index] ?? -1;
      rows.push({
        number: row.key,
        rank: ranks?.[index] ?? row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
        position: row.impressions > 0 && row.positionSum > 0 ? row.positionSum / row.impressions : null,
        googleClicks: gClicks < 0 ? null : gClicks,
        googleImpressions: gImpressions < 0 ? null : gImpressions,
        googlePosition: gImpressions > 0 && gSum > 0 ? gSum / gImpressions : null,
      });
    }
  }
  return rows;
}

function topOf(rows: readonly ListRow[], by: (row: ListRow) => number): ListRow | null {
  const best = rows.reduce<ListRow | null>((held, row) => (held === null || by(row) > by(held) ? row : held), null);
  return best && by(best) > 0 ? best : null;
}

/**
 * The names of a few rows: a keyword's words from the website's book, a
 * page's address from its page numbering, reading only the records they fall
 * in — or every name, for a search over the whole list.
 */
async function namesOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", numbers: readonly number[], every = false): Promise<Map<number, string>> {
  if (list === "query") {
    if (!every) return await bingKeywordsAt(ctx, holdId, numbers);
    const book = await wholeBingBookInQuery(ctx, holdId);
    return new Map(numbers.map((number) => [number, book[number] ?? ""]));
  }
  const addresses = await decodePages(ctx, holdId, numbers.map(pageRefOf));
  return new Map(numbers.map((number, index) => [number, addresses[index] ?? ""]));
}

/** What a list asks for: its period, its search and filters, and its order. */
export type ListAsk = {
  list: "query" | "page";
  period: BingPeriodArg;
  q?: string;
  band?: string;
  google?: "both" | "onlyBing";
  who?: "BING" | "GOOGLE" | "ONLY_BING";
  kind?: string;
  sort?: keyof typeof SORTS;
  direction?: "asc" | "desc";
};

/**
 * A list read whole, filtered and sorted, its rows named only when a search
 * needs every name (§4.5): the page, the download and Ask Hakken all read it,
 * and name the rows they show (`shownRows`).
 */
export async function readList(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, args: ListAsk) {
  const parts = await periodParts(ctx, holdId, args.list, args.period);
  const rows = rowsOfParts(parts);
  const words = args.q ? keywordMatch(args.q).split(" ").filter(Boolean) : [];
  // A page's kind is worked out from its address, as every screen's is (`pageKinds.ts`): its addresses read whole only then.
  const kinds = args.list === "page" && args.kind ? await readPageKinds(ctx, holdId) : null;
  const names = words.length > 0 || kinds ? await namesOf(ctx, holdId, args.list, rows.map((row) => row.number), true) : null;
  const filtered = rows.filter((row) => {
    if (names && words.length > 0 && !words.every((word) => (names.get(row.number) ?? "").toLowerCase().includes(word))) return false;
    if (kinds && names && kinds.kindOf(names.get(row.number) ?? "") !== args.kind) return false;
    if (args.band && bandOf(row.position) !== args.band) return false;
    if (args.google === "both" && row.googleImpressions === null) return false;
    if (args.google === "onlyBing" && row.googleImpressions !== null) return false;
    if (args.who && whoRanksHigher(row) !== args.who) return false;
    return true;
  });
  const sorted = filtered.sort(listOrder(SORTS, args.sort ?? "clicks", args.direction, rankName));
  const summary = {
    rows: rows.length,
    onBoth: rows.filter((row) => row.googleImpressions !== null && row.position !== null).length,
    bingHigher: rows.filter((row) => whoRanksHigher(row) === "BING").length,
    googleHigher: rows.filter((row) => whoRanksHigher(row) === "GOOGLE").length,
    onlyBing: rows.filter((row) => whoRanksHigher(row) === "ONLY_BING").length,
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    /** Rows Bing sends more clicks than Google does. */
    moreOnBing: rows.filter((row) => row.googleClicks !== null && row.clicks > row.googleClicks).length,
  };
  return {
    rows: sorted,
    names,
    from: parts[0]?.from ?? null,
    to: parts[0]?.to ?? null,
    /** Custom dates whose lists are not built yet (`prepareBingCustom`): the screen asks and waits. */
    preparing: typeof args.period !== "string" && parts.length === 0,
    summary,
    /** The row bringing the most clicks from Bing, whatever is filtered or sorted: What Hakken sees reads it. */
    top: topOf(rows, (row) => row.clicks),
    /** The row Google ranks highest above Bing: Bing against Google's What Hakken sees reads it. */
    widestGoogle: topOf(rows.filter((row) => whoRanksHigher(row) === "GOOGLE"), (row) => (row.position ?? 0) - (row.googlePosition ?? 0)),
  };
}

/**
 * The period before's clicks for each row of a list, by its number (ask-hakken-every-chart-plan-2026-10-31.md, the
 * last sources): a chart of Bing's searches or pages sets each against them, as the screens do.
 */
export async function beforeClicksOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", period: BingPeriodArg): Promise<Map<number, number> | null> {
  const parts = await periodParts(ctx, holdId, list, period, "BEFORE");
  if (parts.length === 0) return null;
  // Never a part of a span set against the whole of one: Last 12 months' span before holds only the weeks still kept
  // (`beforeIsWhole`, found 2026-11-04). Its span from its first part alone, so the list itself is not read twice.
  const now = await ctx.db
    .query("bingPeriods")
    .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("period", bingPeriodKey(period)).eq("which", "NOW").eq("part", 0))
    .first();
  if (!now || !beforeIsWhole(now, parts[0])) return null;
  return new Map(rowsOfParts(parts).map((row) => [row.number, row.clicks]));
}

/** The titles Google Analytics saw for a few pages, from the website's page list. */
async function titlesOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, addresses: readonly string[]) {
  const titles = new Map<string, string>();
  for (const address of addresses) {
    const row = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", normalisePage(address))).first();
    if (row?.title) titles.set(address, row.title);
  }
  return titles;
}

/** Rows as the screens show them: named, a page with its title. */
export async function shownRows(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", rows: readonly ListRow[], known: Map<number, string> | null = null) {
  const names = known ?? await namesOf(ctx, holdId, list, rows.map((row) => row.number));
  const titles = list === "page" ? await titlesOf(ctx, holdId, rows.map((row) => names.get(row.number) ?? "")) : new Map<string, string>();
  return rows.map((row) => {
    const key = names.get(row.number) ?? "";
    return {
      key,
      ref: list === "page" ? pageRefOf(row.number) : String(row.number),
      title: titles.get(key) ?? null,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      googleClicks: row.googleClicks,
      googleImpressions: row.googleImpressions,
      googlePosition: row.googlePosition,
    };
  });
}

/** A summary's two named rows, for What Hakken sees. */
async function summaryRows(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", read: Awaited<ReturnType<typeof readList>>) {
  const picked = [read.top, read.widestGoogle].filter((row): row is ListRow => row !== null);
  const [top, widest] = await shownRows(ctx, holdId, list, picked, read.names);
  const named = (row: (typeof top) | undefined) => (row ? { key: row.key, ref: row.ref, clicks: row.clicks, position: row.position, googlePosition: row.googlePosition } : null);
  return { top: read.top ? named(top) : null, widestGoogle: read.widestGoogle ? named(read.top ? widest : top) : null };
}

const topValidator = v.union(v.null(), v.object({ key: v.string(), ref: v.string(), clicks: v.number(), position: orNull(v.number()), googlePosition: orNull(v.number()) }));

const summaryValidator = v.object({
  rows: v.number(),
  onBoth: v.number(),
  bingHigher: v.number(),
  googleHigher: v.number(),
  onlyBing: v.number(),
  clicks: v.number(),
  moreOnBing: v.number(),
  top: topValidator,
  widestGoogle: topValidator,
});

/** A page of Keywords or Pages — or of Bing against Google — searched, filtered, sorted and paged on the server. */
export const bingListPage = tenantQuery({
  args: { ...listArgs, page: v.number(), rows: v.number() },
  returns: v.object({
    rows: v.array(shownRowValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    preparing: v.boolean(),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    summary: summaryValidator,
    /** Pages only: the website's classifications, A to Z, and Not sorted — the filter's choices. */
    kinds: v.array(v.object({ id: v.string(), name: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { siteId: _siteId, page: asked, rows: size, ...ask } = args;
    const choices = args.list === "page" ? (await readPageKinds(ctx, site.hold._id))?.choices ?? [] : [];
    const list = await readList(ctx, site.hold._id, ask);
    const page = pageOfList(list.rows, asked, size);
    return {
      rows: await shownRows(ctx, site.hold._id, args.list, page.rows, list.names),
      total: page.total,
      page: page.page,
      pages: page.pages,
      size: page.size,
      cut: null,
      preparing: list.preparing,
      from: list.from,
      to: list.to,
      summary: { ...list.summary, ...(await summaryRows(ctx, site.hold._id, args.list, list)) },
      kinds: choices.length > 0 ? [...choices.map((choice) => ({ id: choice.id, name: choice.name })), { id: NOT_SORTED_KIND, name: null }] : [],
    };
  },
});

/** Every row of a list, named, in the order on screen: its download. */
export const bingListAll = tenantQuery({
  args: listArgs,
  returns: v.array(shownRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { siteId: _siteId, ...ask } = args;
    const list = await readList(ctx, site.hold._id, ask);
    return await shownRows(ctx, site.hold._id, args.list, list.rows, list.names ?? await namesOf(ctx, site.hold._id, args.list, list.rows.map((row) => row.number), true));
  },
});

// ---------------------------------------------------------------------------
// What the eye reads of a whole list
// ---------------------------------------------------------------------------

const seenTotalsValidator = v.object({ rows: v.number(), clicks: v.number(), impressions: v.number() });
const seenPickValidator = v.object({
  name: v.string(),
  ref: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  position: orNull(v.number()),
  googleClicks: orNull(v.number()),
  googleImpressions: orNull(v.number()),
  googlePosition: orNull(v.number()),
  clicksBefore: orNull(v.number()),
  impressionsBefore: orNull(v.number()),
  positionBefore: orNull(v.number()),
});

/**
 * A whole list's figures for the eye (`utils/bingWebmasterSeen.ts`): its totals now and the span before, who ranks the
 * website higher, each place band on both engines, the rows new and lost, the biggest movers, the widest gaps between
 * the engines, and for Pages each kind of page. The page's table shows one page of the list; the eye reads this beside
 * it. One read for Keywords and Bing against Google, whatever the table is sorted or filtered by, so paging never runs
 * it again: the span before was held for every list, and no screen read it.
 */
export async function readListSeen(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page", period: BingPeriodArg) {
  const parts = await periodParts(ctx, holdId, list, period);
  if (parts.length === 0) return null;
  const rows = rowsOfParts(parts);
  // The span before only where it is whole: Last 12 months' holds only the weeks still kept (`beforeIsWhole`).
  const built = await periodParts(ctx, holdId, list, period, "BEFORE");
  const beforeParts = built[0] && beforeIsWhole(parts[0], built[0]) ? built : [];
  const before = beforeParts.length > 0
    ? beforeParts.flatMap(rowsOfBingPart).map((row) => ({ number: row.key, clicks: row.clicks, impressions: row.impressions, position: positionOfRow(row) }))
    : null;
  // Pages: each page's kind from its address, as the Pages filter works it out (`pageKinds.ts`), the span before's too.
  const kinds = list === "page" ? await readPageKinds(ctx, holdId) : null;
  const addresses = kinds ? await namesOf(ctx, holdId, "page", [...new Set([...rows.map((row) => row.number), ...(before ?? []).map((row) => row.number)])]) : null;
  const seen = wholeListOf(rows, before, kinds && addresses ? (number) => kinds.kindOf(addresses.get(number) ?? "") : undefined);
  const picked = seenNumbers(seen);
  const names = addresses ?? await namesOf(ctx, holdId, list, picked);
  const titles = list === "page" ? await titlesOf(ctx, holdId, picked.map((number) => names.get(number) ?? "")) : new Map<string, string>();
  return {
    from: parts[0].from,
    to: parts[0].to,
    beforeFrom: beforeParts[0]?.from ?? null,
    beforeTo: beforeParts[0]?.to ?? null,
    ...namedListSeen(seen, (number) => {
      const key = names.get(number);
      if (!key || key.startsWith("~")) return null;
      return { name: list === "page" ? pageNameOf(key, titles.get(key) ?? null) : key, ref: list === "page" ? pageRefOf(number) : String(number) };
    }, (kind) => kinds?.nameOf(kind) ?? null),
  };
}

/** A Bing list read whole for the eye: Keywords, Pages and Bing against Google hand it beside their table's page. */
export const bingListSeen = tenantQuery({
  args: { siteId: v.id("companyWebsites"), list: v.union(v.literal("query"), v.literal("page")), period: bingPeriodArgValidator },
  returns: v.union(v.null(), v.object({
    from: v.string(),
    to: v.string(),
    beforeFrom: v.union(v.string(), v.null()),
    beforeTo: v.union(v.string(), v.null()),
    totals: seenTotalsValidator,
    before: v.union(v.null(), seenTotalsValidator),
    both: v.object({ rows: v.number(), clicks: v.number(), impressions: v.number(), googleClicks: v.number(), googleImpressions: v.number() }),
    who: v.object({ bingHigher: v.number(), googleHigher: v.number(), same: v.number(), onlyBing: v.number(), onlyBingClicks: v.number() }),
    bands: v.array(v.object({ band: v.string(), rows: v.number(), clicks: v.number(), impressions: v.number(), googleRows: v.number(), googleClicks: v.number(), googleImpressions: v.number() })),
    newLost: v.union(v.null(), v.object({ gained: v.number(), lost: v.number(), gainedClicks: v.number(), lostClicks: v.number() })),
    up: v.array(seenPickValidator),
    down: v.array(seenPickValidator),
    bingAhead: v.union(v.null(), seenPickValidator),
    googleAhead: v.union(v.null(), seenPickValidator),
    shareHigh: v.union(v.null(), seenPickValidator),
    shareLow: v.union(v.null(), seenPickValidator),
    kinds: v.array(v.object({ name: v.string(), sorted: v.boolean(), rows: v.number(), clicks: v.number(), clicksBefore: orNull(v.number()), impressions: v.number(), googleClicks: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await readListSeen(ctx, site.hold._id, args.list, args.period);
  },
});

// ---------------------------------------------------------------------------
// A keyword's or a page's own screen
// ---------------------------------------------------------------------------

/**
 * One keyword or page, week by week on Bing, with its 90 days beside
 * Google's: `ref` is its place in the website's Bing book, or its page
 * reference, as the lists give it.
 */
export const bingRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), list: v.union(v.literal("query"), v.literal("page")), ref: v.string(), period: v.optional(bingPeriodArgValidator) },
  returns: v.union(v.null(), v.object({
    key: v.string(),
    title: v.union(v.string(), v.null()),
    weeks: v.array(v.object({ week: v.string(), clicks: v.number(), impressions: v.number(), position: orNull(v.number()) })),
    figures: v.union(v.null(), shownRowValidator),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    /** Its figures on Bing the span before; null where the span before isn't built. */
    before: v.optional(v.union(v.null(), v.object({ from: v.string(), to: v.string(), clicks: v.number(), impressions: v.number(), position: orNull(v.number()) }))),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const number = args.list === "page" ? pageNumberOf(args.ref) : Number(args.ref);
    if (!Number.isInteger(number) || number < 0) return null;
    const key = args.list === "query"
      ? (await bingKeywordsAt(ctx, holdId, [number])).get(number) ?? null
      : (await decodePages(ctx, holdId, [pageRefOf(number)]))[0] ?? null;
    if (!key || key.startsWith("~")) return null;
    // Its last 26 weeks, a week at a time: which weeks are held comes from each week's first part.
    const held = await ctx.db
      .query("bingWeeks")
      .withIndex("by_hold_list_part_week", (q) => q.eq("companyWebsiteId", holdId).eq("list", args.list).eq("part", 0))
      .order("desc")
      .take(RECORD_WEEKS);
    const byWeek = new Map<string, BingRow[]>();
    for (const { week } of held) {
      const parts = await ctx.db
        .query("bingWeeks")
        .withIndex("by_hold_list_week_part", (q) => q.eq("companyWebsiteId", holdId).eq("list", args.list).eq("week", week))
        .take(100);
      const mine = parts.flatMap(rowsOfBingPart).filter((row) => row.key === number);
      if (mine.length > 0) byWeek.set(week, mine);
    }
    const weeks = [...byWeek.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([week, rows]) => {
      const [row] = addUpRows([rows]);
      return { week, clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 && row.positionSum > 0 ? row.positionSum / row.impressions : null };
    });
    // Its figures beside Google's for the menu's period, as the list it was opened from.
    const parts = await periodParts(ctx, holdId, args.list, args.period ?? OPENING_PERIOD);
    const row = rowsOfParts(parts).find((entry) => entry.number === number);
    const [figures] = row ? await shownRows(ctx, holdId, args.list, [row], new Map([[number, key]])) : [null];
    const title = args.list === "page" ? (await titlesOf(ctx, holdId, [key])).get(key) ?? null : null;
    // The same keyword or page the span before, as its list's span before keeps it (ask-hakken-every-chart-page-plan-
    // 2026-11-03.md, section 7: held, never read): nothing there is no clicks then.
    const built = await periodParts(ctx, holdId, args.list, args.period ?? OPENING_PERIOD, "BEFORE");
    // Only a whole span before: Last 12 months' holds only the weeks still kept (`beforeIsWhole`).
    const beforeParts = built[0] && parts[0] && beforeIsWhole(parts[0], built[0]) ? built : [];
    const then = beforeParts.flatMap(rowsOfBingPart).find((entry) => entry.key === number);
    const before = beforeParts[0]
      ? { from: beforeParts[0].from, to: beforeParts[0].to, clicks: then?.clicks ?? 0, impressions: then?.impressions ?? 0, position: then ? positionOfRow(then) : null }
      : null;
    return { key, title, weeks, figures: figures ?? null, from: parts[0]?.from ?? null, to: parts[0]?.to ?? null, before };
  },
});

const liveRowValidator = v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), position: v.union(v.number(), v.null()) });

/** A keyword's pages, or a page's keywords, as Bing gave them when its screen opened; null until asked. */
export const bingLiveRows = tenantQuery({
  args: { siteId: v.id("companyWebsites"), ask: v.string() },
  returns: v.union(v.null(), v.array(liveRowValidator)),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const row = await ctx.db.query("bingLive").withIndex("by_hold_ask", (q) => q.eq("companyWebsiteId", site.hold._id).eq("ask", args.ask)).first();
    return row?.rows ?? null;
  },
});

export const liveTarget = internalQuery({
  args: { siteId: v.id("companyWebsites"), companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ holdId: Id<"companyWebsites">; connectionId: Id<"bingConnections">; site: string } | null> => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection?.site || connection.status !== "CONNECTED") return null;
    return { holdId: hold._id, connectionId: connection._id, site: connection.site };
  },
});

export const keepLive = internalMutation({
  args: { holdId: v.id("companyWebsites"), ask: v.string(), rows: v.array(liveRowValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("bingLive").withIndex("by_hold_ask", (q) => q.eq("companyWebsiteId", args.holdId).eq("ask", args.ask)).first();
    if (held) await ctx.db.patch(held._id, { rows: args.rows, askedAt: Date.now() });
    else await ctx.db.insert("bingLive", { companyWebsiteId: args.holdId, ask: args.ask, rows: args.rows, askedAt: Date.now() });
    return null;
  },
});

/**
 * Ask Bing, when a keyword's or a page's own screen opens, for the keyword's
 * pages or the page's keywords, and hold the answer until the next collection
 * (§4.1): its rows are its weeks added up.
 */
export const askBingLive = tenantAction({
  args: { siteId: v.id("companyWebsites"), list: v.union(v.literal("query"), v.literal("page")), key: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.bingWebmasterReads.liveTarget, { siteId: args.siteId, companyId });
    if (!target) return { ok: false };
    const token = await accessTokenFor(ctx, target.connectionId);
    if (!token.ok) return { ok: false };
    const answer = args.list === "query"
      ? await keywordPages(token.accessToken, target.site, args.key)
      : await pageKeywords(token.accessToken, target.site, args.key);
    if (!answer.ok) return { ok: false };
    const byKey = new Map<string, { key: string; clicks: number; impressions: number; positionSum: number }>();
    for (const row of answer.rows) {
      const held = byKey.get(row.key) ?? { key: row.key, clicks: 0, impressions: 0, positionSum: 0 };
      held.clicks += row.clicks;
      held.impressions += row.impressions;
      held.positionSum += (row.position ?? 0) * row.impressions;
      byKey.set(row.key, held);
    }
    const rows = [...byKey.values()]
      .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions)
      .slice(0, 500)
      .map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 && row.positionSum > 0 ? row.positionSum / row.impressions : null }));
    await ctx.runMutation(internal.bingWebmasterReads.keepLive, { holdId: target.holdId, ask: liveAsk(args.list, args.key), rows });
    return { ok: true };
  },
});

/** The name a screen's ask is held under. */
export function liveAsk(list: "query" | "page", key: string): string {
  return `${list === "query" ? "keywordPages" : "pageKeywords"}|${key}`.slice(0, 900);
}

// ---------------------------------------------------------------------------
// Crawling and indexing
// ---------------------------------------------------------------------------

/** Crawling and indexing's figures for a website over a calendar period: the screen and Ask Hakken read them alike. */
export async function readCrawling(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, period: BingPeriodArg) {
  const connection = await connectionOf(ctx, holdId);
  const span = connection ? daysOfPeriod(connection.newestDay, period) : null;
  if (!connection || !span) return null;
  const { from, to } = span;
  const crawlOf = (rows: readonly Doc<"bingDays">[]) => rows.flatMap((day) => day.crawl
    ? [{ day: day.day, crawled: day.crawl.crawled, errors: day.crawl.errors, inIndex: day.crawl.inIndex, blocked: day.crawl.blockedByRobots }]
    : []);
  const days = crawlOf(await bingDaysBetween(ctx, holdId, from, to));
  // The span before: its pages read, errors and pages blocked, and how many pages Bing held in its index on its last
  // day, for the eye to set this span against (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7).
  const spanOf = daysBefore(period, span, connection.oldestDay);
  const daysThen = spanOf ? crawlOf(await bingDaysBetween(ctx, holdId, spanOf.from, spanOf.to)) : [];
  const money = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId)).take(48);
  const bing = new Map((await ctx.db.query("bingPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId)).take(100)).map((row) => [row.page, row]));
  const pages = [];
  for (const row of money) {
    const held = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", row.page)).first();
    const check = bing.get(row.page);
    pages.push({
      page: row.page,
      title: held?.title ?? null,
      inIndex: check ? check.inIndex : null,
      lastRead: check?.lastRead ?? null,
      googleIndexed: row.indexed ? row.indexed.verdict === "PASS" : null,
      googleLastRead: row.indexed?.lastRead ?? null,
    });
  }
  return {
    from,
    to,
    days,
    totals: crawlTotals(days),
    pages,
    checkedAt: connection.pagesCheckedAt ?? null,
    before: spanOf && daysThen.length > 0
      ? { from: spanOf.from, to: spanOf.to, totals: crawlTotals(daysThen), inIndex: [...daysThen].sort((left, right) => left.day.localeCompare(right.day)).at(-1)!.inIndex }
      : null,
  };
}

const crawlTotals = (days: readonly { crawled: number; errors: number; blocked: number }[]) =>
  days.reduce((sum, day) => ({ crawled: sum.crawled + day.crawled, errors: sum.errors + day.errors, blocked: sum.blocked + day.blocked }), { crawled: 0, errors: 0, blocked: 0 });
const crawlTotalsValidator = v.object({ crawled: v.number(), errors: v.number(), blocked: v.number() });

/** How Bing read the website day by day, and each money page in its index beside Google's. */
export const bingCrawling = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: bingPeriodArgValidator },
  returns: v.union(v.null(), v.object({
    from: v.string(),
    to: v.string(),
    days: v.array(v.object({ day: v.string(), crawled: v.number(), errors: v.number(), inIndex: v.number(), blocked: v.number() })),
    totals: crawlTotalsValidator,
    pages: v.array(v.object({
      page: v.string(),
      title: v.union(v.string(), v.null()),
      inIndex: v.union(v.boolean(), v.null()),
      lastRead: v.union(v.string(), v.null()),
      googleIndexed: v.union(v.boolean(), v.null()),
      googleLastRead: v.union(v.string(), v.null()),
    })),
    checkedAt: orNull(v.number()),
    /** The span before: its totals and the pages in Bing's index on its last day; null where Bing's days don't reach back to it. */
    before: v.union(v.null(), v.object({ from: v.string(), to: v.string(), totals: crawlTotalsValidator, inIndex: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await readCrawling(ctx, site.hold._id, args.period);
  },
});

// ---------------------------------------------------------------------------
// Month by month, for Insights' Executive summary (BW13)
// ---------------------------------------------------------------------------

/** Clicks from Bing and from Google a month, for the website's last 12 months: Bing's where it has them. */
export async function bingMonthsOf(ctx: SiteReader, holdId: Id<"companyWebsites">, to: string): Promise<{ month: string; bing: number | null; google: number | null }[]> {
  const from = `${shiftBingDay(`${to.slice(0, 7)}-01`, -334).slice(0, 7)}-01`;
  const bing = await ctx.db.query("bingDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).gte("day", from).lte("day", to)).take(800);
  const google = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", holdId).eq("country", undefined).eq("searchType", "web").gte("day", from).lte("day", to))
    .take(800);
  const months = new Map<string, { bing: number | null; google: number | null }>();
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = shiftBingDay(`${month}-28`, 7).slice(0, 7)) months.set(month, { bing: null, google: null });
  for (const day of bing) {
    const month = months.get(day.day.slice(0, 7));
    if (month && day.clicks !== undefined) month.bing = (month.bing ?? 0) + day.clicks;
  }
  for (const day of google) {
    const month = months.get(day.day.slice(0, 7));
    if (month) month.google = (month.google ?? 0) + day.clicks;
  }
  return [...months.entries()].map(([month, figures]) => ({ month, ...figures }));
}

/** Whether the website reads Bing at all: its Executive summary draws Bing's months only when it does. */
export async function bingConnected(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<boolean> {
  const connection = await connectionOf(ctx, holdId);
  return Boolean(connection?.newestDay);
}
