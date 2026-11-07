import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const moreHandles = readFixture("moreHandlesVisits");

/**
 * Every page's own findings on every period the date menu offers, on More Handles' own figures as saved on 3 November
 * 2026 (ask-hakken-every-chart-page-plan-2026-11-03.md; Anthony, 2026-11-03, after the Visits eye found two things on
 * Last 3 months: "we have a date selection picker FFS … please add this to your tests"). A page whose rules go quiet on
 * one period fails here, before anyone opens the eye.
 */

type Group = { key: string; visits: number; visitsBefore: number | null; engaged: number };
type Period = { visits: { visits: number; visitsBefore: number | null }; groups: Record<string, Group[]>; days: Array<[string, number, number, string?]>; kinds: Array<{ name: string; views: number; sorted: boolean }> };
const PERIODS = moreHandles as unknown as Record<string, Period>;
const NAMES: Record<string, string> = { new: "New", returning: "Returning", female: "Female", male: "Male" };

/** Visits' figures as its page hands them to the eye (`visits/page.tsx`, `VisitsCharts.tsx`). */
function visitsPage(period: Period) {
  const daily = period.days.every((day) => day[3] === undefined);
  return pageDataFor({
    visits: { name: "The whole website", ...period.visits },
    visitorGroups: Object.fromEntries(Object.entries(period.groups).map(([list, rows]) => [list, rows.map((row) => ({ name: NAMES[row.key] ?? row.key, visits: row.visits, visitsBefore: row.visitsBefore, engaged: row.engaged }))])),
    days: { byDay: daily ? Object.fromEntries(period.days.map(([day, fresh, back]) => [day, { new: fresh, returning: back }])) : {}, newName: "New", returningName: "Returning", weekendName: "at weekends", weekdayName: "On weekdays" },
    whatPeopleLookedAt: { kinds: period.kinds },
  }, "googleAnalytics.visitors");
}

describe("Visits finds the biggest things on every period the date menu offers (More Handles, 3 November 2026)", () => {
  // A whole period of days and its span before: always the headline, new against returning, and the groups that moved
  // and that leave at once, from different lists.
  for (const period of ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"]) {
    test(period, () => {
      expectEyeHolds("googleAnalytics.visitors", visitsPage(PERIODS[period]));
      const said = pageFindings("googleAnalytics.visitors", visitsPage(PERIODS[period])).map(findingWords);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
      // Its headline: the whole website's visits against the span before.
      expect(said.some((line) => line.startsWith("The whole website: visits")), said.join("\n")).toBe(true);
      // Never Hakken's housekeeping, never a browser's market move.
      expect(said.some((line) => line.includes("Not sorted yet")), said.join("\n")).toBe(false);
      expect(said.some((line) => /^(Chrome|Safari|Edge|Firefox)[^,]*: visits (up|down)/.test(line)), said.join("\n")).toBe(false);
    });
  }

  // A period only begun, a day or two of it: still the headline against the same days before.
  for (const period of ["thisWeek", "thisMonth"]) {
    test(period, () => {
      expectEyeHolds("googleAnalytics.visitors", visitsPage(PERIODS[period]));
      const said = pageFindings("googleAnalytics.visitors", visitsPage(PERIODS[period])).map(findingWords);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(2);
    });
  }

  test("weekends against weekdays only where every point is a day: never a week read as a Monday", () => {
    const year = pageFindings("googleAnalytics.visitors", visitsPage(PERIODS.last12Months));
    expect(year.some((one) => one.id.startsWith("rowBelow:weekend"))).toBe(false);
    const month = pageFindings("googleAnalytics.visitors", visitsPage(PERIODS.lastMonth));
    expect(month.some((one) => one.id.startsWith("rowBelow:weekend"))).toBe(true);
  });
});
