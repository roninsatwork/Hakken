import { describe, expect, test } from "vitest";
import { dayAndHourIn, usualPeopleThisTime, usualThisTime, weekdaysIn } from "./googleAnalyticsLiveUsual";
import { eventHourKey, totalHourKey } from "./googleAnalyticsLists";

describe("A usual half hour at this time of the week (Live)", () => {
  test("a moment is read on the website's own clock, in summer time and out of it", () => {
    // 09:58 in London on Friday 6 November, when London is on GMT.
    expect(dayAndHourIn(Date.parse("2026-11-06T09:58:00Z"), "Europe/London")).toEqual({ dayOfWeek: 5, hour: 9 });
    // In summer time the same clock reading is an hour on.
    expect(dayAndHourIn(Date.parse("2026-07-03T09:58:00Z"), "Europe/London")).toEqual({ dayOfWeek: 5, hour: 10 });
    // Midnight on another clock is another day: Friday night in New York is Saturday in London.
    expect(dayAndHourIn(Date.parse("2026-11-07T03:30:00Z"), "America/New_York")).toEqual({ dayOfWeek: 5, hour: 22 });
    expect(dayAndHourIn(Date.parse("2026-11-07T00:00:00Z"), "Europe/London")).toEqual({ dayOfWeek: 6, hour: 0 });
  });

  test("the days of a week in some dates, first and last included", () => {
    // October 2026 starts on a Thursday, so it has five of Thursday, Friday and Saturday, and four of the others.
    expect(weekdaysIn("2026-10-01", "2026-10-31", 5)).toBe(5);
    expect(weekdaysIn("2026-10-01", "2026-10-31", 1)).toBe(4);
    expect(weekdaysIn("2026-10-02", "2026-10-02", 5)).toBe(1);
    expect(weekdaysIn("2026-10-03", "2026-10-03", 5)).toBe(0);
  });

  test("only counted events at that hour on that day, a half hour's share of each such day", () => {
    const rows = [
      { key: eventHourKey("add_to_cart", "5", "09"), times: 178 },
      { key: eventHourKey("purchase", "5", "09"), times: 15 },
      { key: eventHourKey("page_view", "5", "09"), times: 9000 },
      { key: eventHourKey("add_to_cart", "5", "10"), times: 300 },
      { key: eventHourKey("add_to_cart", "4", "09"), times: 300 },
    ];
    // 193 times over 5 Fridays is 38.6 an hour, so 19.3 a half hour.
    expect(usualThisTime(rows, new Set(["add_to_cart", "purchase"]), 5, 9, 5)).toBe(19.3);
    expect(usualThisTime(rows, new Set(["add_to_cart"]), 3, 9, 4)).toBe(0);
    // None of that day in the dates: nothing to say, rather than nought.
    expect(usualThisTime(rows, new Set(["add_to_cart"]), 5, 9, 0)).toBeNull();
  });

  test("people and views at that hour on that day, a half hour's share of each such day", () => {
    const rows = [
      { key: totalHourKey("5", "10"), people: 300, views: 1000 },
      { key: totalHourKey("5", "11"), people: 999, views: 999 },
      { key: totalHourKey("6", "10"), people: 999, views: 999 },
    ];
    // Five Fridays: 300 people at 10am, so 60 a Friday, so 30 a half hour.
    expect(usualPeopleThisTime(rows, 5, 10, 5)).toEqual({ people: 30, views: 100 });
    // Nobody at that hour is a usual of none, once the hours are saved at all.
    expect(usualPeopleThisTime(rows, 1, 3, 4)).toEqual({ people: 0, views: 0 });
    expect(usualPeopleThisTime(rows, 5, 10, 0)).toBeNull();
  });
});
