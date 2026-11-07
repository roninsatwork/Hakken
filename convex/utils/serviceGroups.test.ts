import { describe, expect, test } from "vitest";
import { readFixture } from "@/src/test/readFixture";
import type { ServicesAnswer } from "../googleAnalyticsServiceReads";
import { SERVICE_GROUPS, acrossLines, groupNameInEnglish, middleOf, perHundredOf, serviceGroupOf, serviceSplit, tidy, upLines } from "./serviceGroups";

/**
 * Where Services' groups split (services-new-page-plan-2026-11-07.md, step 3): the middle service's visits across, tidied, and the
 * whole website's events for every 100 visits up, on Ronins' own figures for every date the menu offers. Named by their numbers.
 */

const PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
const SAVED = readFixture<Record<(typeof PERIODS)[number], ServicesAnswer>>("roninsServices");
const opening = (answer: ServicesAnswer) => serviceSplit(answer.services, (service) => ({ x: service.now.visits, y: perHundredOf(service.now.events, service.now.visits) }), perHundredOf(answer.website.events, answer.website.visits));

describe("a figure people can say", () => {
  test("whole numbers under 10, never under 1; the nearest 5 under 100; the nearest 10 past it", () => {
    expect([0.2, 1.4, 6.5, 9.4, 12, 27, 32.5, 99, 134, 1_046].map(tidy)).toEqual([1, 1, 7, 9, 10, 25, 35, 100, 130, 1_050]);
  });

  test("the middle of some figures, or the two either side of it halved", () => {
    expect(middleOf([5, 1, 9])).toBe(5);
    expect(middleOf([4, 1, 9, 6])).toBe(5);
    expect(middleOf([])).toBe(0);
  });

  test("the lines on offer: half, the middle and twice, across tidied and up to one place", () => {
    expect(acrossLines([10, 30, 50, 0])).toEqual({ half: 15, middle: 30, twice: 60 });
    expect(upLines(1.64)).toEqual({ half: 0.8, middle: 1.6, twice: 3.3 });
  });

  test("a service on a line counts as past it", () => {
    expect(serviceGroupOf({ x: 30, y: 1.6 }, { x: 30, y: 1.6 })).toBe("rightHigh");
    expect(serviceGroupOf({ x: 29, y: 1.6 }, { x: 30, y: 1.6 })).toBe("leftHigh");
    expect(serviceGroupOf({ x: 30, y: 1.5 }, { x: 30, y: 1.6 })).toBe("rightLow");
  });

  test("named by their numbers alone, one visit said as one", () => {
    expect(groupNameInEnglish("rightHigh", { x: 30, y: 1.6 })).toBe("30 visits or more, and 1.6 or more events for every 100");
    expect(groupNameInEnglish("leftLow", { x: 1, y: 4.3 })).toBe("Under 1 visit, and under 4.3 events for every 100");
    expect(groupNameInEnglish("rightLow", { x: 1_050, y: 2 }, "page views")).toBe("1,050 page views or more, and under 2.0 events for every 100");
  });
});

describe("Ronins' services, on every date the menu offers", () => {
  test("last 12 months: the lines at 30 visits and 1.6 events for every 100, the groups as the board drew them", () => {
    const split = opening(SAVED.last12Months);
    expect(split.split).toEqual({ x: 30, y: 1.6 });
    const figures = SERVICE_GROUPS.map((group) => [split.groups[group].length, split.groups[group].reduce((sum, one) => sum + one.now.visits, 0), split.groups[group].reduce((sum, one) => sum + one.now.events, 0)]);
    expect(figures).toEqual([[12, 739, 31], [7, 1_175, 12], [3, 45, 3], [16, 268, 0]]);
  });

  test.each(PERIODS)("%s: every service with visits is in one group, and the line across moves with the dates", (period) => {
    const answer = SAVED[period];
    const split = opening(answer);
    const withVisits = answer.services.filter((one) => one.now.visits > 0);
    expect(SERVICE_GROUPS.reduce((sum, group) => sum + split.groups[group].length, 0)).toBe(withVisits.length);
    expect(split.split.x).toBeGreaterThanOrEqual(1);
    expect(split.split.x).toBeLessThanOrEqual(Math.max(...withVisits.map((one) => one.now.visits)));
  });
});
