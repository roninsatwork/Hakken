import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import en from "@/messages/en.json";
import { crawlingSeen, eyeWords, listSeen, performanceSeen, recordSeen, type BingEyeNames } from "@/src/app/(dashboard)/app/bing-webmaster/_components/bingSeesData";
import { beforeIsWhole, bingListSeen, namedListSeen, pageNameOf, type BingSeenBefore, type BingSeenRow } from "../bingWebmasterSeen";
import { CALENDAR_PERIODS, type CalendarPeriod } from "../calendarPeriods";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const byHand = readFixture("bingMoreHandlesByHand");

/**
 * Every Bing Webmaster chart page's own findings on every period the date menu offers (ask-hakken-every-chart-page-plan-
 * 2026-11-03.md, section 7; Anthony, 2026-11-03: "we have a date selection picker FFS … please add this to your tests").
 *
 * No website had Bing connected on 3 November 2026 (the `bingConnections` table was empty), so these are figures written
 * by hand (`src/test/fixtures/bingMoreHandlesByHand.json`): Bing's invented for a shop like More Handles, with its own
 * keywords, pages and kinds of page and Google's scale from its Search Console, shaped exactly as each Bing read answers.
 * Built here the way the reads and the pages build them — the whole list through the read's own `bingListSeen`, each
 * page's figures through its own `bingSeesData.ts` — then cut as the eye cuts them (`pageDataFor`). These rules have not
 * yet met a real website's Bing figures.
 */

type Compact = typeof byHand;
type PeriodFigures = Compact["periods"]["lastMonth"];
type ListFigures = NonNullable<PeriodFigures["keywords"]>;
const PERIODS = byHand.periods as unknown as Record<CalendarPeriod, PeriodFigures>;
const DAYS = byHand.days as Array<[string, number, number, number, number, number, number, number, number]>;
const PAGE_NAMES = byHand.pageNames as Array<[string, string | null, string | null]>;
const WHOLE: readonly CalendarPeriod[] = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"];
const BEGUN: readonly CalendarPeriod[] = ["thisWeek", "thisMonth"];

/** The names as `useBingEyeNames` gives them, in English. */
function namesFor(period: CalendarPeriod): BingEyeNames {
  const words = en.bingWebmaster;
  const periods = en.common.periods as unknown as Record<string, string> & { before: Record<string, string> };
  const before = periods.before[period];
  return {
    bing: words.chart.bing,
    google: words.chart.google,
    before: before.charAt(0).toUpperCase() + before.slice(1),
    period: periods[period],
    weekOf: (day) => words.seen.eye.weekOf.replace("{day}", day),
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

const daysIn = (span: { from: string; to: string } | null) => (span ? DAYS.filter(([day]) => day >= span.from && day <= span.to) : []);
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
  const rows: BingSeenRow[] = (figures.rows as Array<[number, number, number, number | null, number | null, number | null, number | null]>).map(([number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition]) => ({ number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition }));
  const held = figures.before && beforeIsWhole(figures, figures.before) ? figures.before : null;
  const before: BingSeenBefore[] | null = held ? (held.rows as Array<[number, number, number, number | null]>).map(([number, clicks, impressions, position]) => ({ number, clicks, impressions, position })) : null;
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
  const rows = (figures.rows as Array<[number, number, number, number | null, number | null, number | null, number | null]>).map(([number, clicks, impressions, position, googleClicks, googleImpressions, googlePosition]) => ({
    key: list === "page" ? pageAddress(number) : keywordName(number), ref: String(number), title: list === "page" ? PAGE_NAMES[number][1] : null,
    clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position, googleClicks, googleImpressions, googlePosition,
  }));
  const gap = (row: (typeof rows)[number]) => (row.position === null || row.googlePosition === null ? -Infinity : row.googlePosition - row.position);
  const sorted = [...rows].sort((left, right) => (byGap ? gap(right) - gap(left) : right.clicks - left.clicks));
  return { rows: sorted.slice(0, 25), total: rows.length, page: 1, pages: Math.ceil(rows.length / 25), size: 25, from: figures.from, to: figures.to };
}

/** `bingRecord`'s answer for a keyword or a page, and the rows Bing gave its screen. */
function recordOf(period: CalendarPeriod, list: "query" | "page") {
  const source = list === "query" ? byHand.records.keyword : byHand.records.page;
  const figures = list === "query" ? PERIODS[period].keywords : PERIODS[period].pages;
  const row = (figures?.rows as Array<[number, number, number, number | null, number | null, number | null, number | null]> | undefined)?.find((entry) => entry[0] === source.number);
  if (!figures || !row) return null;
  const [, clicks, impressions, position, googleClicks, googleImpressions, googlePosition] = row;
  const key = list === "query" ? keywordName(source.number) : pageAddress(source.number);
  const held = figures.before && beforeIsWhole(figures, figures.before) ? figures.before : null;
  const then = (held?.rows as Array<[number, number, number, number | null]> | undefined)?.find((entry) => entry[0] === source.number);
  const record = {
    key,
    title: list === "page" ? PAGE_NAMES[source.number][1] : null,
    weeks: (source.weeks as Array<[string, number, number, number | null]>).map(([week, weekClicks, weekImpressions, weekPosition]) => ({ week, clicks: weekClicks, impressions: weekImpressions, position: weekPosition })),
    figures: { key, ref: String(source.number), title: null, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position, googleClicks, googleImpressions, googlePosition },
    from: figures.from,
    to: figures.to,
    before: held ? { from: held.from, to: held.to, clicks: then?.[1] ?? 0, impressions: then?.[2] ?? 0, position: then?.[3] ?? null } : null,
  };
  const rows = (source.rows as Array<[string, number, number, number]>).map(([rowKey, rowClicks, rowImpressions, rowPosition]) => ({ key: rowKey, clicks: rowClicks, impressions: rowImpressions, position: rowPosition }));
  return recordSeen(list, record, rows, namesFor(period));
}

/** Each page's figures as it hands them to its eye, by the eye's key. */
function pagesOf(period: CalendarPeriod): Record<string, unknown> {
  const names = namesFor(period);
  const figures = performanceSeen(performanceOf(period), names);
  const words = eyeWords(names);
  const { keywords, pages } = PERIODS[period];
  return {
    "bing.performance": figures,
    "bing.keywords": keywords ? listSeen(figures, tablePageOf(keywords, "query"), wholeListOf(keywords, "query"), words) : null,
    "bing.pages": pages ? listSeen(figures, tablePageOf(pages, "page"), wholeListOf(pages, "page"), words) : null,
    "bing.versus": keywords ? listSeen(figures, tablePageOf(keywords, "query", true), wholeListOf(keywords, "query"), words) : null,
    "bing.crawling": crawlingSeen(crawlingOf(period), names),
    "bing.keyword": recordOf(period, "query"),
    "bing.page": recordOf(period, "page"),
  };
}

const said = (screen: string, data: unknown) => {
  expectEyeHolds(screen, data);
  return pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
};

/** Each page's headline, as `findingWords` says it. */
const HEADLINES: Record<string, RegExp> = {
  "bing.performance": /^Bing: clicks (up|down) /,
  "bing.keywords": /^Bing: clicks (up|down) /,
  "bing.pages": /^Bing: clicks (up|down) /,
  "bing.versus": /^Bing: [\d.]+% of all the clicks from Bing and Google/,
  "bing.crawling": /^Bing: pages read by the search engine (up|down) /,
  "bing.keyword": /^door handles: place in search results [\d.]+, against [\d.]+ for Google\./,
  // A page's clicks against the span before, or against Google's where no whole span before is held.
  "bing.page": /: clicks ((up|down) |[\d]+, against [\d]+ for Google\.)/,
};

/** Never trivia, Hakken's housekeeping, or money: Bing counts clicks and times shown. */
const NEVER = /Not sorted|Unclassified|£|\$|€|worth|revenue|sales|cost/i;

describe("every Bing Webmaster chart page finds the biggest things on every period the date menu offers (figures by hand)", () => {
  test("the figures cover every period, and only This week has no week of keywords and pages yet", () => {
    expect(Object.keys(PERIODS).sort()).toEqual([...CALENDAR_PERIODS].sort());
    for (const period of CALENDAR_PERIODS) expect(PERIODS[period].keywords === null, period).toBe(period === "thisWeek");
  });

  for (const period of WHOLE) {
    test(period, () => {
      for (const [screen, data] of Object.entries(pagesOf(period))) {
        expect(data, `${screen} on ${period} hands its eye nothing`).toBeTruthy();
        const lines = said(screen, data);
        const shown = `${screen} on ${period}:\n${lines.join("\n")}`;
        expect(lines.length, shown).toBeGreaterThanOrEqual(4);
        expect(HEADLINES[screen].test(lines[0]), shown).toBe(true);
        expect(lines.some((line) => NEVER.test(line)), shown).toBe(false);
      }
    });
  }

  for (const period of BEGUN) {
    test(`${period}, only begun`, () => {
      for (const [screen, data] of Object.entries(pagesOf(period))) {
        // This week's keywords and pages wait for a Bing week ending inside it: the page says so, and hands nothing.
        if (data === null) {
          expect(period === "thisWeek" && ["bing.keywords", "bing.pages", "bing.versus", "bing.keyword", "bing.page"].includes(screen), screen).toBe(true);
          continue;
        }
        const lines = said(screen, data);
        const shown = `${screen} on ${period}:\n${lines.join("\n")}`;
        expect(lines.length, shown).toBeGreaterThanOrEqual(2);
        expect(lines.some((line) => NEVER.test(line)), shown).toBe(false);
      }
    });
  }

  test("Last 12 months' span before is part of one, so no list is set against it", () => {
    const whole = wholeListOf(PERIODS.last12Months.keywords, "query")!;
    expect(PERIODS.last12Months.keywords!.before).not.toBeNull();
    expect(whole.before).toBeNull();
    expect(whole.up).toEqual([]);
    expect(said("bing.keywords", pagesOf("last12Months")["bing.keywords"]).some((line) => line.includes("the biggest rise"))).toBe(false);
  });
});
