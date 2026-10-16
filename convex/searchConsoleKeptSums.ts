import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { shiftDay } from "./searchConsoleDays";
import type { SearchConsoleList, SearchType } from "./searchConsoleSchema";
import { lineKeywords } from "./searchConsoleKeywordBooks";
import { addressesOf, decodeWith, isPageRef } from "./holdPageRefs";
import { unpackedPart, type Packed, type StoredPacked } from "./utils/searchConsolePacks";
import { KeywordSums, RowSums, Terms, addKeywords, addPart, numbered } from "./utils/searchConsoleSums";
import { LINES_READ_DAYS, chartPeriods, daysBetween, daysFrom, lastDayOf, type ChartGrain, type ChartPeriod } from "./utils/searchConsoleChartDays";
import { bandOf, isBrand } from "./utils/searchConsoleViews";
import { dayVolatility, periodVolatility, type Volatility } from "./utils/searchConsoleVolatility";

/**
 * A website's kept days added up as they are read (search-console-streamed-lists-plan.md,
 * SL1 and SL2): every kept day of a list read a part at a time, oldest first,
 * and added into each period it belongs to — the 7 and 30 days and the spans
 * before, the fan-out's 14 and 28 days, each chart day, week and month, the
 * volatility day — then let go. Until 2026-10-16 the build held every day
 * whole (`readKept`) and added them up again for each period: at ten times
 * kordatackle.com that was 256 MB before a period was worked out, and the web
 * lists were never built.
 *
 * What it gives is what the build gave from the days held whole — the same
 * rows in the same order, the same chart figures — so nothing on screen
 * changes (SL6; `searchConsoleKeptSums.test.ts` holds them side by side).
 */

export type Span = { from: string; to: string };
export const spanKey = (span: Span) => `${span.from}|${span.to}`;
const within = (day: string, span: Span) => day >= span.from && day <= span.to;

/** Days of kept day records read an ask, so no one ask reads too much. */
const DAYS_PER_READ = 15;

/** A kept day's part, decoded: its keywords and pages as text. */
export type KeptPart = { start: string; packed: Packed };

/**
 * Every kept day of one list — all countries', or one country's — oldest
 * first, a part at a time, decoded and handed to `visit`: the 60 days kept, or
 * a first collection's 90 before they are cleared, or the days of `only`.
 * Nothing is held but the part in hand.
 */
export async function forEachKeptPart(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsoleList,
  newest: string,
  visit: (part: KeptPart) => void,
  only?: Span,
): Promise<void> {
  const from = only?.from ?? shiftDay(newest, 1 - LINES_READ_DAYS);
  const to = only?.to ?? newest;
  const scope = country === undefined ? {} : { country };
  // Page references back to addresses, from the website's page list read once a run (`holdPageRefs.ts`), read again
  // once should a part name a page added since.
  const pageRefs = list === "pair" || list === "page";
  let book = pageRefs ? await addressesOf(ctx, companyWebsiteId) : null;
  let bookFresh = false;
  const addresses = async (values: string[]): Promise<string[]> => {
    let decoded = decodeWith(book!, values);
    if (!bookFresh && decoded.some((value) => isPageRef(value))) {
      book = await addressesOf(ctx, companyWebsiteId, true);
      bookFresh = true;
      decoded = decodeWith(book, values);
    }
    return decoded;
  };
  for (let start = from; start <= to; start = shiftDay(start, DAYS_PER_READ)) {
    const end = shiftDay(start, DAYS_PER_READ - 1);
    for (let cursor: string | null = null; ;) {
      const page: { records: Array<Omit<StoredPacked, "keys"> & { keys: string | string[]; start: string }>; continueCursor: string; isDone: boolean } = await ctx.runQuery(
        internal.searchConsoleRollups.keptBetween,
        { companyWebsiteId, ...scope, searchType, list, grain: "DAY", from: start, to: end < to ? end : to, cursor },
      );
      for (const record of page.records) {
        // A `pair` line's keywords from its month's book, read once a run (`searchConsoleKeywordBooks.ts`).
        const keys = await lineKeywords(ctx, companyWebsiteId, country, record.start, record.keys);
        const packed: Packed = { ...unpackedPart(record), keys };
        if (pageRefs) {
          if (list === "page") packed.keys = await addresses(packed.keys);
          if (packed.pages) packed.pages = await addresses(packed.pages);
        }
        visit({ start: record.start, packed });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }
}

/** What a build of the keyword-and-page pairs needs worked out as the days are read. */
export type PairPlan = {
  newest: string;
  oldest: string;
  /** The periods whose pairs are kept: the 7 and 30 days and the spans before. */
  pairSpans: readonly Span[];
  /** The periods whose keywords alone are kept: the fan-out's 14 and 28 days. */
  keywordSpans: readonly Span[];
  /** The charts' days, weeks and months, when the build writes them. */
  chart: { chartWeeks: number; brandWords: readonly string[]; dayLine: string } | null;
};

/** Days whose keywords are kept to the end: the volatility day is the newest complete one, within the last few. */
const RECENT_DAYS = 7;

type OpenPeriod = { grain: ChartGrain; start: string; end: string; sums: KeywordSums | null };

/**
 * The pairs' days, added in as they are read (`add`, oldest first): each
 * period's pairs, the fan-out's keywords, the charts' figures and each day's
 * volatility, and the last days' keywords for the volatility day's lists.
 */
export class PairStream {
  readonly keys = new Terms();
  readonly pages = new Terms();
  readonly pairs = new Map<string, RowSums>();
  readonly keywords = new Map<string, KeywordSums>();
  private readonly chartList: Array<{ grain: ChartGrain; start: string }>;
  private readonly dayPeriods: Set<string>;
  private readonly open: OpenPeriod[];
  private readonly figures = new Map<string, ChartPeriod>();
  private readonly volatility = new Map<string, Volatility>();
  private readonly recent = new Map<string, KeywordSums>();
  private day: string | null = null;
  private dayKeywords: KeywordSums | null = null;
  private before: { day: string; standings: ReturnType<KeywordSums["standings"]> } | null = null;

  constructor(private readonly plan: PairPlan) {
    for (const span of plan.pairSpans) this.pairs.set(spanKey(span), new RowSums(this.keys, this.pages));
    for (const span of plan.keywordSpans) this.keywords.set(spanKey(span), new KeywordSums(this.keys));
    this.chartList = plan.chart ? chartPeriods(plan.newest, plan.oldest, plan.chart.chartWeeks, plan.chart.dayLine) : [];
    this.dayPeriods = new Set(this.chartList.filter((period) => period.grain === "DAY").map((period) => period.start));
    this.open = this.chartList.filter((period) => period.grain !== "DAY").map((period) => ({ ...period, end: lastDayOf(period.grain, period.start), sums: null }));
  }

  /** One kept part of `day`, added into every period it belongs to. Days come oldest first, a day's parts together. */
  add(day: string, packed: Packed): void {
    if (day !== this.day) {
      this.closeDay();
      this.closePeriodsBefore(day);
      this.day = day;
      this.dayKeywords = new KeywordSums(this.keys);
    }
    const part = numbered(packed, this.keys, this.pages);
    for (const span of this.plan.pairSpans) if (within(day, span)) addPart(this.pairs.get(spanKey(span))!, part);
    for (const span of this.plan.keywordSpans) if (within(day, span)) addKeywords(this.keywords.get(spanKey(span))!, part);
    addKeywords(this.dayKeywords!, part);
    for (const period of this.open) {
      if (day < period.start || day > period.end) continue;
      period.sums ??= new KeywordSums(this.keys);
      addKeywords(period.sums, part);
    }
  }

  /** Every day read: the last day and the open weeks and months worked out. */
  finish(): void {
    this.closeDay();
    this.closePeriodsBefore(null);
  }

  /** The charts' figures, in the charts' order: what `chartFigures` gives for the same days. */
  weeks(): ChartPeriod[] {
    return this.chartList.map(({ grain, start }) => this.figures.get(`${grain}|${start}`) ?? this.figureOf(grain, start, null));
  }

  /** One of the last days' keywords; undefined when not among them. */
  recentKeywords(day: string): KeywordSums | undefined {
    return this.recent.get(day);
  }

  private closeDay(): void {
    if (this.day === null || this.dayKeywords === null) return;
    const day = this.day;
    const standings = this.dayKeywords.standings();
    if (this.before && this.before.day === shiftDay(day, -1)) this.volatility.set(day, dayVolatility(standings, this.before.standings));
    this.before = { day, standings };
    if (this.dayPeriods.has(day)) this.figures.set(`DAY|${day}`, this.figureOf("DAY", day, this.dayKeywords));
    this.recent.set(day, this.dayKeywords);
    if (this.recent.size > RECENT_DAYS) this.recent.delete(this.recent.keys().next().value!);
    this.day = null;
    this.dayKeywords = null;
  }

  /** Weeks and months ended before `day` (all, when null) worked out, and their sums let go. */
  private closePeriodsBefore(day: string | null): void {
    for (const period of this.open) {
      if (period.sums === null || (day !== null && day <= period.end)) continue;
      this.figures.set(`${period.grain}|${period.start}`, this.figureOf(period.grain, period.start, period.sums));
      period.sums = null;
      period.end = "";
    }
  }

  /** A chart period's figures from its keywords: as `chartFigures` counts them. */
  private figureOf(grain: ChartGrain, start: string, sums: KeywordSums | null): ChartPeriod {
    const { newest, oldest } = this.plan;
    const brandWords = this.plan.chart?.brandWords ?? [];
    const end = lastDayOf(grain, start);
    const held = { from: start > oldest ? start : oldest, to: end < newest ? end : newest };
    const figures: ChartPeriod = { grain, week: start, days: daysBetween(held.from, held.to), top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0 };
    for (const keyword of sums?.summed() ?? []) {
      if (keyword.impressions > 0) {
        const band = bandOf(keyword.positionSum / keyword.impressions);
        if (band === "1-3") figures.top3 += 1;
        else if (band === "4-10") figures.top10 += 1;
        else if (band === "11-20") figures.top20 += 1;
        else figures.rest += 1;
      }
      if (isBrand(keyword.key, brandWords)) figures.brandClicks += keyword.clicks;
      else figures.otherClicks += keyword.clicks;
    }
    const scored = grain === "DAY" ? [this.volatility.get(start)] : daysFrom(held.from, held.to).map((one) => this.volatility.get(one));
    const days = scored.filter((one): one is Volatility => one !== undefined);
    return days.length === 0 ? figures : { ...figures, ...(grain === "DAY" ? days[0] : periodVolatility(days)) };
  }
}

/** A list's days other than the pairs — pages, countries, devices, rich results — added into each period as read. */
export class ListStream {
  readonly keys = new Terms();
  readonly sums = new Map<string, RowSums>();

  constructor(private readonly spans: readonly Span[]) {
    for (const span of spans) this.sums.set(spanKey(span), new RowSums(this.keys, null));
  }

  add(day: string, packed: Packed): void {
    const part = numbered(packed, this.keys, null);
    for (const span of this.spans) if (within(day, span)) addPart(this.sums.get(spanKey(span))!, part);
  }
}

/** The pairs' kept days read and added up in one pass (SL1). */
export async function streamPairs(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  plan: PairPlan,
): Promise<PairStream> {
  const stream = new PairStream(plan);
  await forEachKeptPart(ctx, companyWebsiteId, country, searchType, "pair", plan.newest, (part) => stream.add(part.start, part.packed));
  stream.finish();
  return stream;
}

/** One kept list read and added up into its periods in one pass (SL1). */
export async function streamList(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsoleList,
  newest: string,
  spans: readonly Span[],
): Promise<ListStream> {
  const stream = new ListStream(spans);
  await forEachKeptPart(ctx, companyWebsiteId, country, searchType, list, newest, (part) => stream.add(part.start, part.packed));
  return stream;
}

/**
 * A day's keywords for the volatility day's lists: from the stream's last
 * days, or that day read again on its own when it is older (a rare day Google
 * left half-filled for a week).
 */
export async function keywordsOnDay(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  stream: PairStream,
  newest: string,
  day: string,
): Promise<KeywordSums> {
  const held = stream.recentKeywords(day);
  if (held) return held;
  const sums = new KeywordSums(stream.keys);
  await forEachKeptPart(ctx, companyWebsiteId, country, searchType, "pair", newest, (part) => addKeywords(sums, numbered(part.packed, stream.keys, stream.pages)), { from: day, to: day });
  return sums;
}
