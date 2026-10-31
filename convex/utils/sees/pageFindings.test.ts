import { describe, expect, test } from "vitest";
import { findingWords } from "./findings";
import { pageFindings } from "./pageFindings";

/**
 * The general rules over any page's own figures (sees-every-page-plan-2026-10-31.md, phase 3), on answers shaped like
 * the screens' own: Search Console's searches with last period's clicks, Clarity's pages with how far people scroll,
 * Visibility's websites.
 */
const searches = {
  totals: { clicks: 900, clicksBefore: 1200, impressions: 40000 },
  rows: [
    { key: "door handles", clicks: 520, previousClicks: 300, impressions: 9000, ctrPercent: 5.8 },
    { key: "brass hinges", clicks: 160, previousClicks: 480, impressions: 8000, ctrPercent: 2 },
    { key: "cabinet knobs", clicks: 120, previousClicks: 130, impressions: 1500, ctrPercent: 8 },
    { key: "door stops", clicks: 60, previousClicks: 70, impressions: 12000, ctrPercent: 0.5 },
    { key: "letter plates", clicks: 40, previousClicks: 45, impressions: 900, ctrPercent: 4.4 },
  ],
};

describe("what a page's own figures show", () => {
  test("the whole fell, the biggest rise and fall on the list, and the one holding most of it", () => {
    const found = pageFindings("searchConsole.keywords", searches);
    const words = found.map(findingWords);
    expect(words).toContain("Clicks fell to 900 from 1200 the span before.");
    expect(words).toContain("door handles: clicks rose to 520 from 300, the biggest rise on the list.");
    expect(words).toContain("brass hinges: clicks fell to 160 from 480, the biggest fall on the list.");
    // At most four from one list: the list's four strongest, before the share it holds.
    expect(words.filter((line) => line.startsWith("door handles holds"))).toEqual([]);
    expect(pageFindings("searchConsole.keywords", { rows: searches.rows.map(({ key, clicks }) => ({ key, clicks })) }).map(findingWords)).toEqual(["door handles holds 57.8% of the list's clicks."]);
    // Each finding's figures are keyed by its place, for the writer to name.
    expect(found[0].facts[0].key).toMatch(/^f1\./);
    expect(found.length).toBeLessThanOrEqual(6);
  });

  test("a percentage far from the list's average, weighed by its own base, on rows enough to trust", () => {
    const words = pageFindings("searchConsole.keywords", { rows: searches.rows }).map(findingWords);
    // Weighed by the times shown: door stops are shown most and clicked least; door handles clicked twice the average.
    expect(words).toContain("door stops: share clicked 0.5%, against 2.9% on average across the list.");
    expect(words).toContain("door handles: share clicked 5.8%, against 2.9% on average across the list.");
  });

  test("a figure where less is better is marked so; a figure not on the measures list is never a finding", () => {
    const clarity = { pages: [
      { page: "/basket", visits: 300, rage: 40, scroll: 20 },
      { page: "/", visits: 900, rage: 5, scroll: 45 },
      { page: "/about", visits: 200, rage: 2, scroll: 70 },
      { page: "/blog", visits: 150, rage: 1, scroll: 48 },
    ] };
    const found = pageFindings("clarity.pages", clarity);
    expect(found.find((finding) => finding.kind === "rowBelow")?.params).toMatchObject({ name: "/basket", measure: "scroll", value: 20 });
    expect(pageFindings("visibility.something", { rows: [{ name: "a", widgets: 5 }, { name: "b", widgets: 9 }, { name: "c", widgets: 1 }] })).toEqual([]);
    expect(pageFindings("visibility.something", null)).toEqual([]);
    // A row named by a code the screen turns into words is never a finding's name (seen on Almost there, 2026-10-31).
    expect(pageFindings("searchConsole.almost", { byIntent: [{ kind: "UNJUDGED", clicks: 97 }, { kind: "BUYING", clicks: 50 }, { kind: "RESEARCHING", clicks: 30 }, { kind: "BRAND", clicks: 23 }] })).toEqual([]);
  });

  test("small moves and even lists say nothing", () => {
    const even = { totals: { clicks: 100, clicksBefore: 96 }, rows: [{ key: "a", clicks: 25, previousClicks: 24 }, { key: "b", clicks: 25, previousClicks: 26 }, { key: "c", clicks: 25, previousClicks: 23 }, { key: "d", clicks: 25, previousClicks: 23 }] };
    expect(pageFindings("searchConsole.keywords", even)).toEqual([]);
  });

  test("the span before kept beside the figures, as the Products screen keeps its steps", () => {
    const products = { figures: { steps: { looked: 24587, basket: 5108, checkout: 2310, bought: 1246 }, before: { looked: 23200, basket: 4910, checkout: 2950, bought: 1080 } } };
    const words = pageFindings("googleAnalytics.products", products).map(findingWords);
    expect(words).toContain("Checkouts started fell to 2310 from 2950 the span before.");
  });
});
