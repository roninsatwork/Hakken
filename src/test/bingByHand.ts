import en from "@/messages/en.json";
import { beforeIsWhole, bingListSeen, namedListSeen, pageNameOf, type BingSeenBefore, type BingSeenRow } from "@/convex/utils/bingWebmasterSeen";
import type { CalendarPeriod } from "@/convex/utils/calendarPeriods";
import type { BingEyeNames } from "@/convex/utils/sees/eyeData/bing";
import { englishDay, englishShortDay } from "@/convex/utils/sees/eyeData/englishDays";

/**
 * Bing Webmaster's reads answered from the figures written by hand (`src/test/fixtures/bingMoreHandlesByHand.json`,
 * read by the test with `readFixture`): Bing's invented for a shop like More Handles, shaped exactly as each read answers
 * (`bingPerformance`, `bingCrawling`, `bingListSeen`, `bingListPage`'s first page, `bingRecord` and the rows Bing gave a
 * record's screen). Shared by the rules' test of every period (`convex/utils/sees/bingPageFindings.test.ts`) and the
 * chat app's builders' test (`convex/chatAppEyes/bing.test.ts`), so both read the very same answers. No website had Bing
 * connected when they were written.
 */

type ListRowFigures = [number, number, number, number | null, number | null, number | null, number | null];
type BeforeRowFigures = [number, number, number, number | null];
type Span = { from: string; to: string };
type ListFigures = { from: string; to: string; rows: ListRowFigures[]; before: (Span & { rows: BeforeRowFigures[] }) | null };
type RecordFigures = { number: number; weeks: Array<[string, number, number, number | null]>; rows: Array<[string, number, number, number]> };
export type BingPeriodFigures = { span: Span | null; before: Span | null; keywords: ListFigures | null; pages: ListFigures | null };
export type BingByHandFixture = {
  days: Array<[string, number, number, number, number, number, number, number, number]>;
  keywordNames: string[];
  pageNames: Array<[string, string | null, string | null]>;
  money: Array<{ page: string; title: string | null; inIndex: boolean | null; lastRead: string | null; googleIndexed: boolean | null; googleLastRead: string | null }>;
  periods: Record<CalendarPeriod, BingPeriodFigures>;
  records: { keyword: RecordFigures; page: RecordFigures };
};

/** The names as `useBingEyeNames` gives them, in English. */
export function bingNamesFor(period: CalendarPeriod): BingEyeNames {
  const words = en.bingWebmaster;
  const periods = en.common.periods as unknown as Record<string, string> & { before: Record<string, string> };
  const before = periods.before[period];
  return {
    bing: words.chart.bing,
    google: words.chart.google,
    before: before.charAt(0).toUpperCase() + before.slice(1),
    period: periods[period],
    weekOf: (day) => words.seen.eye.weekOf.replace("{day}", day),
    day: englishDay,
    shortDay: englishShortDay,
    topThree: words.seen.eye.topThree,
    bingHigher: words.versus.bingHigher,
    googleHigher: words.versus.googleHigher,
    onlyBing: words.versus.onlyBing,
    inGoogleNotBing: words.seen.eye.inGoogleNotBing,
    averageDay: words.seen.eye.averageDay,
    home: words.seen.eye.home,
    lastSixWeeks: words.seen.eye.lastSixWeeks,
    sixWeeksBefore: words.seen.eye.sixWeeksBefore,
  };
}

/** Each Bing read's answer for a period, from the figures by hand. */
export function bingByHandReads(byHand: BingByHandFixture) {
  const PERIODS = byHand.periods;
  const DAYS = byHand.days;
  const PAGE_NAMES = byHand.pageNames;

  const daysIn = (span: Span | null) => (span ? DAYS.filter(([day]) => day >= span.from && day <= span.to) : []);
  const add = (rows: ReadonlyArray<ReadonlyArray<string | number>>, at: number) => rows.reduce((sum, row) => sum + (row[at] as number), 0);
  const mondayOf = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  };

  /** `bingPerformance`'s answer for a period: its days, Bing's and Google's totals, the weeks, and the span before. */
  function performanceOf(period: CalendarPeriod) {
    const { span, before } = PERIODS[period];
    if (!span) return null;
    const days = daysIn(span);
    const weeks = new Map<string, { bing: number; google: number }>();
    for (const [day, clicks, , googleClicks] of days) {
      const week = weeks.get(mondayOf(day)) ?? { bing: 0, google: 0 };
      week.bing += clicks;
      week.google += googleClicks;
      weeks.set(mondayOf(day), week);
    }
    const then = daysIn(before);
    return {
      from: span.from,
      to: span.to,
      days: days.map(([day, clicks, impressions]) => ({ day, clicks, impressions })),
      totals: { clicks: add(days, 1), impressions: add(days, 2) },
      google: { clicks: add(days, 3), impressions: add(days, 4) },
      weeks: [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([week, figures]) => ({ week, ...figures })),
      before: before && then.length > 0 ? { from: before.from, to: before.to, totals: { clicks: add(then, 1), impressions: add(then, 2) }, google: { clicks: add(then, 3), impressions: add(then, 4) } } : null,
    };
  }

  /** `bingCrawling`'s answer for a period. */
  function crawlingOf(period: CalendarPeriod) {
    const { span, before } = PERIODS[period];
    if (!span) return null;
    const days = daysIn(span);
    const then = daysIn(before);
    const totals = (rows: typeof days) => ({ crawled: add(rows, 5), errors: add(rows, 6), blocked: add(rows, 8) });
    return {
      from: span.from,
      to: span.to,
      days: days.map(([day, , , , , crawled, errors, inIndex, blocked]) => ({ day, crawled, errors, inIndex, blocked })),
      totals: totals(days),
      pages: byHand.money,
      checkedAt: null,
      before: before && then.length > 0 ? { from: before.from, to: before.to, totals: totals(then), inIndex: then.at(-1)![7] } : null,
    };
  }

  const keywordName = (number: number) => byHand.keywordNames[number];
  const pageAddress = (number: number) => PAGE_NAMES[number][0];

  /** `bingListSeen`'s answer, built the way `readListSeen` builds it: the read's own summary, then its rows named. */
  function wholeListOf(figures: ListFigures | null, list: "query" | "page") {
    if (!figures) return null;
    const rows: BingSeenRow[] = figures.rows.map(([number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition]) => ({ number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition }));
    const held = figures.before && beforeIsWhole(figures, figures.before) ? figures.before : null;
    const before: BingSeenBefore[] | null = held ? held.rows.map(([number, clicks, impressions, position]) => ({ number, clicks, impressions, position })) : null;
    const seen = bingListSeen(rows, before, list === "page" ? (number) => PAGE_NAMES[number][2] ?? "NOT_SORTED" : undefined);
    return {
      from: figures.from,
      to: figures.to,
      beforeFrom: held?.from ?? null,
      beforeTo: held?.to ?? null,
      ...namedListSeen(seen, (number) => ({
        name: list === "page" ? pageNameOf(pageAddress(number), PAGE_NAMES[number][1]) : keywordName(number),
        ref: list === "page" ? `~${number.toString(36)}` : String(number),
      }), (kind) => (kind === "NOT_SORTED" ? null : kind)),
    };
  }

  /** `bingListPage`'s first page, as the table opens: the most clicks first, or the widest gap on Bing against Google. */
  function tablePageOf(figures: ListFigures | null, list: "query" | "page", byGap = false) {
    if (!figures) return undefined;
    const rows = figures.rows.map(([number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition]) => ({
      key: list === "page" ? pageAddress(number) : keywordName(number), ref: String(number), title: list === "page" ? PAGE_NAMES[number][1] : null,
      clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position, googleClicks, googleImpressions, googlePosition,
    }));
    const gap = (row: (typeof rows)[number]) => (row.position === null || row.googlePosition === null ? -Infinity : row.googlePosition - row.position);
    const sorted = [...rows].sort((left, right) => (byGap ? gap(right) - gap(left) : right.clicks - left.clicks));
    return { rows: sorted.slice(0, 25), total: rows.length, page: 1, pages: Math.ceil(rows.length / 25), size: 25, from: figures.from, to: figures.to };
  }

  /** `bingRecord`'s answer for the keyword or the page written by hand, its words or address, and the rows Bing gave its screen. */
  function recordOf(period: CalendarPeriod, list: "query" | "page") {
    const source = list === "query" ? byHand.records.keyword : byHand.records.page;
    const figures = list === "query" ? PERIODS[period].keywords : PERIODS[period].pages;
    const row = figures?.rows.find((entry) => entry[0] === source.number);
    if (!figures || !row) return null;
    const [, clicks, impressions, position, googleClicks, googleImpressions, googlePosition] = row;
    const key = list === "query" ? keywordName(source.number) : pageAddress(source.number);
    const held = figures.before && beforeIsWhole(figures, figures.before) ? figures.before : null;
    const then = held?.rows.find((entry) => entry[0] === source.number);
    const record = {
      key,
      title: list === "page" ? PAGE_NAMES[source.number][1] : null,
      weeks: source.weeks.map(([week, weekClicks, weekImpressions, weekPosition]) => ({ week, clicks: weekClicks, impressions: weekImpressions, position: weekPosition })),
      figures: { key, ref: String(source.number), title: null, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position, googleClicks, googleImpressions, googlePosition },
      from: figures.from,
      to: figures.to,
      before: held ? { from: held.from, to: held.to, clicks: then?.[1] ?? 0, impressions: then?.[2] ?? 0, position: then?.[3] ?? null } : null,
    };
    const rows = source.rows.map(([rowKey, rowClicks, rowImpressions, rowPosition]) => ({ key: rowKey, clicks: rowClicks, impressions: rowImpressions, position: rowPosition }));
    return { key, ref: list === "page" ? `~${source.number.toString(36)}` : String(source.number), record, rows };
  }

  return { PERIODS, performanceOf, crawlingOf, wholeListOf, tablePageOf, recordOf };
}
