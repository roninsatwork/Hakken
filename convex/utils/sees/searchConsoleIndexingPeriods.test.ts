import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";
import { reasonOf, reasonSlug, kindOf } from "../indexingReasons";
import { reasonBoxes, reasonPages, reasonRows, type FoldedFigures, type ProblemPage } from "../indexingFigures";
import { indexingSees, reasonSees } from "./searchConsoleScreens";
import { indexingBoxes, indexingPageData, indexingRows, pageNameOf, reasonPageData, titleCounts } from "@/src/app/(dashboard)/app/search-console/_components/indexingSees";

/**
 * Indexing's eye (search-console-indexing-v1-plan-2026-11-18.md, "The eye"), and a reason's own page's, on every period
 * the date menu offers, on More Handles' own checks: Google's URL inspection answers for 1,238 of its pages on
 * 18 November 2026, with each period's clicks from its kept page list (every country's; This week's wasn't built, so
 * it has none). The checks don't follow the dates, so the reasons are the same on every period; the clicks do.
 * Each page's figures are built here the way the page builds them for its eye (`IndexingParts`, `indexingSees`).
 */

type Problem = ProblemPage & { indexed: boolean };
type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const read = readFixture("moreHandlesSearchConsoleIndexing") as {
  indexed: number;
  checked: number;
  problems: Problem[];
  periods: Record<Period, { clicks: number; impressions: number; pages: Array<[string, number, number]> }>;
};
const PERIODS: Period[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
const BEFORE: Record<Period, string> = {
  thisWeek: "The same days last week", lastWeek: "The week before", thisMonth: "The same days last month", lastMonth: "The month before",
  last3Months: "The 3 months before", last6Months: "The 6 months before", last12Months: "The 12 months before",
};
const PRINT = process.env.PRINT_SEES === "1";

/** English names, as the screen says them: Google's terms, short names, plain lines and Sources. */
const namesOf = (words: string) => {
  const reason = reasonOf(words);
  return reason
    ? { name: reason.words, short: reason.key, means: reason.means, source: reason.source === "website" ? "Website" : "Google systems" }
    : { name: words, short: words, means: "", source: "–" };
};

/** A period's figures, joined to the checks by the link Google answered for: the checks here asked Search Console's own links. */
function figuresOf(period: Period): FoldedFigures {
  const own = read.periods[period];
  const byAddress = new Map(own.pages.map(([key, clicks, impressions]) => [key, { clicks, impressions }]));
  return { byPage: new Map(read.problems.flatMap((page) => { const found = byAddress.get(page.address); return found ? [[page.page, found] as const] : []; })), clicks: own.clicks, impressions: own.impressions };
}

/** The summary's page data, as the page builds it. */
function summaryPage(period: Period) {
  const folded = figuresOf(period);
  const summary = reasonRows(read.problems, null).map((row) => ({ reason: row.reason, pages: row.pages, crawled: row.crawled, inSitemap: read.problems.filter((page) => page.reason === row.reason && page.inSitemap).length }));
  const byReason = reasonRows(read.problems, folded).map((row) => ({ reason: row.reason, clicks: row.clicks, impressions: row.impressions }));
  const rows = indexingRows(summary, { clicks: folded.clicks, impressions: folded.impressions, byReason }, namesOf, reasonSlug);
  const boxes = indexingBoxes(rows, read.indexed, folded.clicks);
  const clicked = read.problems
    .map((page) => ({ ...page, clicks: folded.byPage.get(page.page)?.clicks ?? 0, impressions: folded.byPage.get(page.page)?.impressions ?? 0 }))
    .filter((page) => page.clicks > 0)
    .sort((left, right) => right.clicks - left.clicks)
    .slice(0, 10);
  const titles = titleCounts(clicked);
  return {
    rows,
    boxes,
    data: indexingPageData({
      rows, boxes, weekBefore: null,
      clickedPages: clicked.map((page) => ({ name: pageNameOf(page, titles, "Home page"), reason: page.reason, clicks: page.clicks, impressions: page.impressions })),
      names: { notIndexed: "Not indexed", clicks: "Clicks on pages not indexed", sitemap: "In your sitemap" },
    }),
  };
}

/** One reason's page data, as its page builds it (the days kept aren't read here: its boxes wait for them as the page's do). */
function reasonPage(period: Period, words: string) {
  const folded = figuresOf(period);
  const own = read.problems.filter((page) => page.reason === words);
  const indexedPages = new Set<string>();
  const pages = reasonPages(own, folded, (page) => indexedPages.has(page));
  const boxes = reasonBoxes(kindOf(words), pages, { checked: read.checked, allClicks: folded.clicks, month: "2026-11-01", shown: null });
  const titles = titleCounts(pages);
  const named = new Map(pages.map((page) => [page.page, pageNameOf(page, titles, "Home page")]));
  return { pages, boxes, data: reasonPageData({ reason: { ...namesOf(words), kind: kindOf(words) }, pages, boxes, nameOf: (page) => named.get(page.page) ?? page.page, names: { pages: "Pages" } }) };
}

function said(screen: string, period: Period, data: Record<string, unknown>): string[] {
  const words = { before: BEFORE[period] };
  expectEyeHolds(screen, { ...data, words });
  const findings: Finding[] = pageFindings(screen, pageDataFor({ ...data, words }, screen));
  const lines = findings.map(findingWords);
  if (PRINT) console.log(`\n${screen} · ${period}\n  ${lines.join("\n  ")}`);
  for (const line of lines) {
    // Never money, never a code for a name, and never the word Hakken.
    expect(line, lines.join("\n")).not.toMatch(/£|\$|revenue|worth|cost/i);
    expect(line, lines.join("\n")).not.toMatch(/\b[0-9a-z]{32}\b|~[0-9a-z]+/);
    expect(line, lines.join("\n")).not.toMatch(/Hakken/);
  }
  return lines;
}

describe("Indexing's eye on More Handles' checks, every period (18 November 2026)", () => {
  test("the checks found four reasons: most of the pages not in Google are unknown to it", () => {
    const { rows, boxes } = summaryPage("lastMonth");
    expect(rows.map((row) => [row.name, row.pages])).toEqual([["URL is unknown to Google", 189], ["Page with redirect", 10], ["Not found (404)", 2], ["Excluded by ‘noindex’ tag", 1]]);
    expect(boxes).toMatchObject({ notIndexed: 202, reasons: 4, indexed: 1036, allClicks: 8714 });
    expect(indexingSees(rows.map((row) => ({ name: row.name, slug: row.slug, pages: row.pages })), { checked: read.checked })).toEqual({
      says: [{ code: "biggest", text: "URL is unknown to Google", a: 189, b: 202 }],
      steps: [{ code: "seeReason", text: "URL is unknown to Google", link: "seeReasonPages", to: { segment: "indexing/unknown-to-google" } }],
    });
  });

  // More Handles' first real checks gave four reasons a page each, and the box and the eye's line named one the biggest.
  test("a tie at the top names no reason the biggest, in the box or the line", () => {
    const { rows } = summaryPage("lastMonth");
    const tied = rows.slice(0, 2).map((row) => ({ ...row, pages: 1 }));
    expect(indexingBoxes(tied, 352, 1946).biggest).toBeNull();
    expect(indexingBoxes(rows, 1036, 8714).biggest?.name).toBe("URL is unknown to Google");
    expect(indexingSees(tied.map((row) => ({ name: row.name, slug: row.slug, pages: row.pages })), { checked: 356 }).says).toEqual([{ code: "reasonsTied", a: 2, b: 2 }]);
  });

  test.each(PERIODS)("Indexing: %s", (period) => {
    const { data, boxes } = summaryPage(period);
    const lines = said("searchConsole.indexing", period, data);
    // The headline, on every period: the biggest reason's share of the pages not in Google.
    expect(lines[0], lines.join("\n")).toMatch(/^URL is unknown to Google holds 93\.6% of the list's pages not in Google\.$/);
    // The next reasons Google gave, each with its share; the fourth, one page, gives way to the clicks.
    for (const name of ["Page with redirect", "Not found (404)"]) expect(lines.some((line) => line.startsWith(`${name} holds`)), lines.join("\n")).toBe(true);
    if (boxes.clicks > 0) {
      // The clicks pages not in Google still got, against every click on the website's pages, and the pages that got most.
      expect(lines.some((line) => /^Clicks on pages not indexed holds [\d.]+% of the list's clicks on your pages\.$/.test(line)), lines.join("\n")).toBe(true);
      expect(lines.some((line) => /holds [\d.]+% of the list's clicks on pages not in Google\.$/.test(line)), lines.join("\n")).toBe(true);
    } else {
      // This week's list wasn't built: nothing said of clicks.
      expect(lines.some((line) => line.includes("clicks")), lines.join("\n")).toBe(false);
    }
    // No page in More Handles' sitemap was among those Google won't show, so nothing is said of the sitemap.
    expect(lines.some((line) => line.startsWith("In your sitemap")), lines.join("\n")).toBe(false);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(PERIODS)("A reason's own page, URL is unknown to Google: %s", (period) => {
    const { data, boxes } = reasonPage(period, "URL is unknown to Google");
    // Its four boxes are an unknown reason's: Pages, Still shown this month, Clicks and In your sitemap.
    expect(boxes.map((box) => box.key)).toEqual(["pages", "stillShown", "clicks", "sitemap"]);
    expect(boxes.find((box) => box.key === "sitemap")).toMatchObject({ still: false });
    const lines = said("searchConsole.indexingReason", period, data);
    expect(lines[0], lines.join("\n")).toMatch(/^URL is unknown to Google holds 15\.3% of the list's pages checked\.$/);
    const clicks = (boxes.find((box) => box.key === "clicks") as { value: number }).value;
    if (clicks > 0) expect(lines.some((line) => /^URL is unknown to Google holds [\d.]+% of the list's clicks on your pages\.$/.test(line)), lines.join("\n")).toBe(true);
    // Its busiest pages, by the clicks they still got, or by the times Google showed them.
    if (period !== "thisWeek") expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
    expect(reasonSees("URL is unknown to Google", 189, 0).says).toEqual([{ code: "reasonPages", text: "URL is unknown to Google", a: 189 }]);
  });

  test.each(PERIODS)("A reason's own page, Page with redirect: %s", (period) => {
    const { boxes } = reasonPage(period, "Page with redirect");
    // Duplicates and redirects: Pages, Google picked another page, Go to a page in Google, Clicks.
    expect(boxes.map((box) => box.key)).toEqual(["pages", "picked", "inGoogle", "clicks"]);
    expect(boxes.find((box) => box.key === "picked")).toMatchObject({ value: 10 });
    const lines = said("searchConsole.indexingReason", period, reasonPage(period, "Page with redirect").data);
    expect(lines[0], lines.join("\n")).toMatch(/^Page with redirect holds 0\.8% of the list's pages checked\.$/);
  });
});
