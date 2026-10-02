import { describe, expect, test } from "vitest";
import { applyView, bandOf, ctrCurve, filterRows, isBrand, pagesByKeyword, shapeRows, summarise, type SourceRow } from "./searchConsoleViews";

/**
 * The rules each Search Console page lists by (docs/plans/active/
 * search-console-plan.md §13.3), worked on made-up rows.
 */

const row = (key: string, clicks: number, impressions: number, position: number, extra: Partial<SourceRow> = {}): SourceRow =>
  ({ key, clicks, impressions, positionSum: position * impressions, ...extra });
const shaped = (now: SourceRow[], before: SourceRow[] | null = null, tracked: string[] = [], brandWords: string[] | null = null) =>
  shapeRows(now, before, { tracked: new Set(tracked), brandWords });

describe("shaping", () => {
  test("a band is read from Google's average as given", () => {
    expect([3, 3.01, 9.8, 10, 10.7, 20, 20.1, 50, 66.2].map(bandOf)).toEqual(["1-3", "4-10", "4-10", "4-10", "11-20", "11-20", "21-50", "21-50", "51+"]);
  });

  test("a row carries its change, its places moved, its share, and Sites' facts where known", () => {
    const [first, second] = shaped(
      [row("ai agency", 43, 1541, 4.3, { kind: "BUYING", volume: 2400 }), row("web design", 0, 100, 30, { volume: -1 })],
      [row("ai agency", 31, 1000, 5.1)],
      ["ai agency"],
      ["ronins"],
    );
    expect(first).toMatchObject({ change: 12, previousClicks: 31, band: "4-10", tracked: true, kind: "BUYING", volume: 2400, brand: false, share: 1 });
    expect(first.positionChange).toBeCloseTo(0.8);
    // Not shown in the days before: no clicks then, and no places moved.
    expect(second).toMatchObject({ change: 0, previousClicks: null, positionChange: null, volume: null, tracked: false });
  });

  test("a keyword is brand when it uses a brand word, misspellings included", () => {
    expect(isBrand("ronins agency leeds", ["Ronins"])).toBe(true);
    expect(isBrand("ronnins", ["ronins", "ronnins"])).toBe(true);
    expect(isBrand("web design leeds", ["ronins", " "])).toBe(false);
  });
});

describe("each page's rule", () => {
  test("Almost there: positions above 3, up to 20", () => {
    const rows = shaped([row("a", 1, 10, 3), row("b", 1, 10, 4.2), row("c", 1, 10, 20), row("d", 1, 10, 20.1)]);
    expect(applyView("almost", rows).map((entry) => entry.key)).toEqual(["b", "c"]);
  });

  test("Click rate by position: the website's own rate at each whole position, 1 to 20", () => {
    const curve = ctrCurve([
      { clicks: 10, impressions: 100, position: 1.2 },
      { clicks: 5, impressions: 100, position: 0.8 },
      { clicks: 2, impressions: 100, position: 7.4 },
      { clicks: 9, impressions: 9, position: 21 },
    ]);
    expect(curve).toEqual([
      { position: 1, keywords: 2, impressions: 200, clicks: 15, ctr: 0.075 },
      { position: 7, keywords: 1, impressions: 100, clicks: 2, ctr: 0.02 },
    ]);
  });

  test("Shown but not clicked: pages clicked less than the website's own rate at their position would bring", () => {
    const curve = ctrCurve([{ clicks: 2, impressions: 100, position: 7 }]);
    const rows = shaped([row("/low/", 19, 3918, 7.4), row("/fine/", 90, 3918, 7.4), row("/far/", 0, 500, 40)]);
    expect(applyView("lowCtr", rows, { curve })).toEqual([expect.objectContaining({ key: "/low/", usualCtr: 0.02, expected: 78 })]);
  });

  test("Pages competing: keywords with two or more pages, the top two and their shares", () => {
    const pages = pagesByKeyword([
      { key: "ai agency", page: "/", clicks: 2, impressions: 50 },
      { key: "ai agency", page: "/ai-agency/", clicks: 41, impressions: 900 },
      { key: "solo", page: "/", clicks: 5, impressions: 50 },
    ]);
    const rows = shaped([row("ai agency", 43, 950, 4), row("solo", 5, 50, 3)]);
    expect(applyView("competing", rows, { pages })).toEqual([
      expect.objectContaining({ key: "ai agency", count: 2, top: "/ai-agency/", next: "/", topShare: 41 / 43, nextShare: 2 / 43 }),
    ]);
  });

  test("Wins and losses: only keywords whose clicks changed", () => {
    const rows = shaped([row("up", 43, 10, 4), row("same", 5, 10, 4), row("down", 1, 10, 4)], [row("up", 31, 10, 5), row("same", 5, 10, 4), row("down", 6, 10, 3)]);
    expect(applyView("moves", rows).map((entry) => [entry.key, entry.change])).toEqual([["up", 12], ["down", -5]]);
    expect(filterRows(applyView("moves", rows), { move: "loss" }).map((entry) => entry.key)).toEqual(["down"]);
  });

  test("Missed demand: Sites' most-searched keywords Google barely shows, or every shown keyword not tracked", () => {
    const rows = shaped([row("shown a lot", 4, 900, 8), row("barely", 0, 14, 61.2)], null, ["shown a lot"]);
    const sitesKeywords = [
      { keyword: "barely", volume: 6600, kind: "BUYING" },
      { keyword: "never shown", volume: 1000, kind: "RESEARCHING" },
      { keyword: "shown a lot", volume: 5000, kind: "BUYING" },
      { keyword: "hardly searched", volume: 20, kind: "BUYING" },
    ];
    expect(applyView("missed", rows, { sitesKeywords, missedList: "searched" }).map((entry) => [entry.key, entry.volume, entry.impressions])).toEqual([
      ["barely", 6600, 14],
      ["never shown", 1000, 0],
    ]);
    expect(applyView("missed", rows, { missedList: "untracked" }).map((entry) => entry.key)).toEqual(["barely"]);
  });

  test("Real against estimated: an estimate more than a quarter off Google's clicks is too high or too low", () => {
    const rows = shaped([
      row("/a/", 1, 10, 4, { estimate: 1033 }),
      row("/b/", 9, 10, 4, { estimate: 11 }),
      row("/c/", 40, 10, 4, { estimate: 12 }),
      row("/d/", 4, 10, 4, { estimate: -1 }),
    ]);
    expect(applyView("estimates", rows).map((entry) => [entry.key, entry.verdict, entry.gap])).toEqual([
      ["/a/", "high", 1032],
      ["/b/", "close", 0],
      ["/c/", "low", -28],
    ]);
  });
});

describe("filters", () => {
  test("searched by the start of a word, then by tracked, band, kind and brand", () => {
    const rows = shaped(
      [row("plumber leeds", 8, 100, 3, { kind: "BUYING" }), row("emergency plumber", 3, 100, 6, { kind: "RESEARCHING" }), row("ronins", 9, 10, 1)],
      null,
      ["ronins"],
      ["ronins"],
    );
    expect(filterRows(rows, { q: "plum" }).map((entry) => entry.key)).toEqual(["plumber leeds", "emergency plumber"]);
    expect(filterRows(rows, { q: "umber" })).toEqual([]);
    expect(filterRows(rows, { tracked: "no", band: "1-3" }).map((entry) => entry.key)).toEqual(["plumber leeds"]);
    expect(filterRows(rows, { kind: "RESEARCHING" }).map((entry) => entry.key)).toEqual(["emergency plumber"]);
    expect(filterRows(rows, { brand: "yes" }).map((entry) => entry.key)).toEqual(["ronins"]);
  });
});

describe("a page's hero boxes", () => {
  test("added up over every row the page's rule lists, never only the rows on screen, with the days before", () => {
    const all = shaped(
      [row("ronins agency", 9, 100, 1.5, { kind: "BRANDED" }), row("ai agency", 43, 1541, 4.3, { kind: "BUYING", volume: 2400 }), row("web design", 2, 900, 14, { kind: "BUYING", volume: 1000 })],
      [row("ai agency", 31, 1000, 5.1), row("web design", 6, 800, 12), row("gone", 1, 10, 30)],
      ["ai agency"],
      ["ronins"],
    );
    const listed = applyView("almost", all);
    const summary = summarise(listed, all, [row("ai agency", 31, 1000, 5.1), row("web design", 6, 800, 12), row("gone", 1, 10, 30)], { brandWords: ["ronins"] });
    expect(summary).toMatchObject({
      rows: 2, of: 3, clicks: 45, impressions: 2441, tracked: 1, gaining: 1, gained: 12, losing: 1, lost: 4, volume: 3400,
      bands: { "1-3": 0, "4-10": 1, "11-20": 1, "21-50": 0, "51+": 0 },
      bandsBefore: { "1-3": 0, "4-10": 1, "11-20": 1, "21-50": 1, "51+": 0 },
      pagesInvolved: null,
    });
    expect(summary.kinds).toEqual([{ kind: "BUYING", rows: 2, clicks: 45 }]);
    // Brand against the rest is the whole list's, whatever the page lists.
    expect(summary.brand).toEqual({
      now: { brandClicks: 9, nonBrandClicks: 45, brandImpressions: 100, nonBrandImpressions: 2441 },
      before: { brandClicks: 0, nonBrandClicks: 38, brandImpressions: 0, nonBrandImpressions: 1810 },
    });
  });

  test("Pages competing counts the pages its keywords split, of every page any keyword was shown with", () => {
    const pages = pagesByKeyword([
      { key: "ai agency", page: "/", clicks: 2, impressions: 50 },
      { key: "ai agency", page: "/ai-agency/", clicks: 41, impressions: 900 },
      { key: "solo", page: "/solo/", clicks: 5, impressions: 50 },
    ]);
    const all = shaped([row("ai agency", 43, 950, 4), row("solo", 5, 50, 3)]);
    const summary = summarise(applyView("competing", all, { pages }), all, null, { pages, brandWords: null });
    expect(summary).toMatchObject({ rows: 1, of: 2, pagesInvolved: 2, pagesShown: 3, bandsBefore: null, brand: null });
  });
});
