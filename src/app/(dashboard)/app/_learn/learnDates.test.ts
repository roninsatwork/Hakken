import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatLongDay, formatWhen, isoWeek, localDay } from "./learnDates";

/** The days Learn reads by (docs/plans/active/knowledge-news-and-digest-plan.md, revised again 2026-10-01). */
describe("Learn's dates", () => {
  it("numbers the week as the ISO calendar does, across the turn of a year", () => {
    expect(isoWeek("2026-10-01")).toBe(40);
    expect(isoWeek("2026-12-31")).toBe(53);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2025-12-29")).toBe(1);
  });

  it("counts whole days, the clocks going back or not", () => {
    expect(daysBetween("2026-09-24", "2026-10-01")).toBe(7);
    expect(daysBetween("2026-10-20", "2026-10-27")).toBe(7);
    expect(daysBetween("2026-10-01", "2026-09-24")).toBe(-7);
    expect(addDays("2026-09-24", 14)).toBe("2026-10-08");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("writes the day as a British or an Italian newspaper does", () => {
    expect(formatLongDay("2026-10-01", "en")).toBe("Thursday, 1 October 2026");
    expect(formatLongDay("2026-10-01", "it")).toBe("giovedì 1 ottobre 2026");
  });

  it("reads the reader's own calendar day", () => {
    expect(localDay(new Date(2026, 9, 1, 23, 30))).toBe("2026-10-01");
  });

  it("says how long ago a story came, then its date", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(formatWhen(now - 2 * 60 * 60 * 1000, "en", now)).toBe("2 hours ago");
    expect(formatWhen(now - 30 * 60 * 60 * 1000, "en", now)).toBe("yesterday");
    // British English, as Sites writes days: never "Sep 24".
    expect(formatWhen(Date.parse("2026-09-24T12:00:00Z"), "en", now)).toMatch(/^24 Sept?$/);
    expect(formatWhen(Date.parse("2026-09-24T12:00:00Z"), "it", now)).toBe("24 set");
  });
});
