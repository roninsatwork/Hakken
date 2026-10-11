import { describe, expect, test } from "vitest";
import { opportunitiesFrom, pagePlanFrom, planBrief, siteRateOf, type PageFigures } from "./insightPlan";

/**
 * Opportunities and the page plan (insights-analyst-plan.md §4.1, phase 9):
 * the searches nearly won, worth most first, priced with their page's rate;
 * and each page's one thing to do, enquiries lost first — on figures shaped
 * like ronins.co.uk's.
 */

const page = (path: string, kind: string | null, visits: number, enquiries: number, visitsBefore: number | null = null, enquiriesBefore: number | null = null): PageFigures =>
  ({ page: path, kind, title: null, visits, enquiries, visitsBefore, enquiriesBefore });

const PAGES = [
  page("/", "HOME", 460, 44, 750, 72),
  page("/ai-consultancy/", "SERVICE", 85, 6, 10, 0),
  page("/ai-agency/", "SERVICE", 700, 31, 600, 26),
  page("/chatbot-agency/", "SERVICE", 200, 3, 260, 12),
  page("/hub/kapferer-brand-identity-prism/", "ARTICLE", 300, 1, 200, 0),
  page("/hub/european-accessibility-act-uk/", "ARTICLE", 120, 1, 400, 13),
  page("/tiny/", "SERVICE", 12, 3),
];

describe("opportunities", () => {
  test("searches 4th to 30th, worth most first, each priced with its page's rate; brand searches and Google's top three left out", () => {
    const rows = opportunitiesFrom(
      [
        { keyword: "ai consultancy", position: 26, page: "/ai-consultancy/", volume: 2400 },
        { keyword: "ai automation agency", position: 9, page: "/ai-agency/", volume: 720 },
        { keyword: "ai agency", position: 2, page: "/ai-agency/", volume: 5000 },
        { keyword: "tiny service", position: 12, page: "/tiny/", volume: 300 },
      ],
      [
        { search: "ai consultancy", impressions: 4027, position: 25.7, brand: false },
        { search: "ronins", impressions: 900, position: 5, brand: true },
        { search: "wordpress agency", impressions: 5584, position: 12, brand: false },
        { search: "rare search", impressions: 12, position: 8, brand: false },
      ],
      PAGES,
    );
    expect(rows.map((row) => row.search)).toEqual(["ai consultancy", "ai automation agency", "wordpress agency", "tiny service"]);
    expect(rows[0]).toMatchObject({ place: 25.7, volume: 2400, shown: 4027, page: "/ai-consultancy/", service: "/ai-consultancy/", rate: 7.1 });
    expect(rows[2]).toMatchObject({ volume: null, shown: 5584, page: null, rate: null, worth: null });
    // Twelve visits say nothing about a page's rate.
    expect(rows[3]).toMatchObject({ rate: null, worth: null });
  });
});

describe("the page plan", () => {
  test("enquiries lost first, then the nearest wins, then refreshes, guides and what to keep", () => {
    const opportunities = opportunitiesFrom([{ keyword: "ai consultancy", position: 26, page: "/ai-consultancy/", volume: 2400 }], [], PAGES);
    const plan = pagePlanFrom(
      PAGES,
      [
        { kind: "MERGED", from: "/blockchain-developers/", to: "/blockchain-development-company/", before: 12, after: 2, result: "LOST" },
        { kind: "MERGED", from: "/webflow/", to: "/webflow-agency/", before: 6, after: 5, result: "HELD" },
      ],
      opportunities,
      siteRateOf(PAGES),
    );
    expect(plan.map((row) => [row.action, row.page, row.why, row.a, row.b])).toEqual([
      ["REBUILD", "/chatbot-agency/", "fell", 12, 3],
      ["RESTORE", "/blockchain-development-company/", "heirLost", 12, 2],
      ["STRENGTHEN", "/ai-consultancy/", "bestRate", 7.1, 26],
      ["REFRESH_OR_RETIRE", "/hub/european-accessibility-act-uk/", "guideFell", 13, 1],
      ["KEEP_ROUTE", "/hub/kapferer-brand-identity-prism/", "readNotEnquire", 16, 1],
      ["KEEP", "/webflow-agency/", "mergeKept", 6, 5],
    ]);
    expect(planBrief({ opportunities, pages: plan.map((row) => ({ ...row, shouldWin: [] })), siteRate: siteRateOf(PAGES) })).toContain("never its words (I22)");
  });

  test("a money page converting much less than it did is refreshed", () => {
    const plan = pagePlanFrom([page("/", "HOME", 900, 54, 800, 77)], [], [], 6);
    expect(plan[0]).toMatchObject({ action: "REFRESH", why: "rateFell", a: 9.6, b: 6 });
  });
});
