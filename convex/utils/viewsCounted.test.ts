import { describe, expect, test } from "vitest";
import { readFixture } from "../../src/test/readFixture";
import { viewsCountedDifferently } from "./viewsCounted";

type Website = { views: number; viewsBefore: number; visits: number; visitsBefore: number };
const allPages = readFixture("moreHandlesAllPages") as Record<string, { website: Website }>;

describe("page views that look counted differently", () => {
  test("More Handles' dates that cross 3 September 2026 say so, with pages a visit then and now", () => {
    expect(viewsCountedDifferently(allPages.last3Months.website)).toEqual({ pagesAVisit: 6, pagesAVisitBefore: 9.6 });
    expect(viewsCountedDifferently(allPages.last6Months.website)).toEqual({ pagesAVisit: 7.8, pagesAVisitBefore: 9.3 });
    expect(viewsCountedDifferently(allPages.last12Months.website)).toEqual({ pagesAVisit: 8.6, pagesAVisitBefore: 5.2 });
  });

  test("More Handles' dates after the change say nothing, even a week with a real fall", () => {
    for (const period of ["thisWeek", "lastWeek", "thisMonth", "lastMonth"]) {
      expect(viewsCountedDifferently(allPages[period].website), period).toBeNull();
    }
  });

  test("views and visits falling together is a real fall", () => {
    expect(viewsCountedDifferently({ views: 5_000, viewsBefore: 10_000, visits: 1_000, visitsBefore: 2_000 })).toBeNull();
  });

  test("a small website's figures move by chance, so it says nothing", () => {
    expect(viewsCountedDifferently({ views: 900, viewsBefore: 300, visits: 300, visitsBefore: 300 })).toBeNull();
  });

  test("a figure it hasn't got says nothing", () => {
    expect(viewsCountedDifferently({ views: 900, viewsBefore: null, visits: 800, visitsBefore: 800 })).toBeNull();
    expect(viewsCountedDifferently({ views: 900, viewsBefore: 0, visits: 800, visitsBefore: 800 })).toBeNull();
  });
});
