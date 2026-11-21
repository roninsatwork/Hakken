import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { bingByHandReads, bingNamesFor, type BingByHandFixture } from "@/src/test/bingByHand";
import { crawlingSeen, eyeWords, listSeen, performanceSeen, recordSeen } from "./eyeData/bing";
import { CALENDAR_PERIODS, type CalendarPeriod } from "../calendarPeriods";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const byHand: BingByHandFixture = readFixture("bingMoreHandlesByHand");

/**
 * Every Bing Webmaster chart page's own findings on every period the date menu offers (ask-hakken-every-chart-page-plan-
 * 2026-11-03.md, section 7; Anthony, 2026-11-03: "we have a date selection picker FFS … please add this to your tests").
 *
 * No website had Bing connected on 3 November 2026 (the `bingConnections` table was empty), so these are figures written
 * by hand (`src/test/fixtures/bingMoreHandlesByHand.json`): Bing's invented for a shop like More Handles, with its own
 * keywords, pages and kinds of page and Google's scale from its Search Console, shaped exactly as each Bing read answers
 * (`src/test/bingByHand.ts`). Built here the way the reads and the pages build them — the whole list through the read's
 * own `bingListSeen`, each page's figures through its own `eyeData/bing.ts` — then cut as the eye cuts them
 * (`pageDataFor`). These rules have not yet met a real website's Bing figures.
 */

const { PERIODS, performanceOf, crawlingOf, wholeListOf, tablePageOf, recordOf: recordAnswerOf } = bingByHandReads(byHand);
const WHOLE: readonly CalendarPeriod[] = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"];
const BEGUN: readonly CalendarPeriod[] = ["thisWeek", "thisMonth"];

/** A keyword's or a page's own screen, as it hands its eye. */
function recordOf(period: CalendarPeriod, list: "query" | "page") {
  const answer = recordAnswerOf(period, list);
  return answer ? recordSeen(list, answer.record, answer.rows, bingNamesFor(period)) : null;
}

/** Each page's figures as it hands them to its eye, by the eye's key. */
function pagesOf(period: CalendarPeriod): Record<string, unknown> {
  const names = bingNamesFor(period);
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
