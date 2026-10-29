import { describe, expect, it } from "vitest";
import { parseSitePeriod, periodOrOpening } from "./siteRange";

// Thursday 29 October 2026, the canvas's day.
const NOW = new Date("2026-10-29T10:00:00Z");

/** The dates a Sites screen reads from the address (sees-header-and-rolling-dates-plan.md, part two). */
describe("parseSitePeriod", () => {
  it("reads the menu's period, opening on Last month, with a rolling period back from today", () => {
    expect(parseSitePeriod(new URLSearchParams(""), NOW)).toMatchObject({ period: "lastMonth", from: "2026-09-01", to: "2026-09-30", step: "day", whole: true });
    expect(parseSitePeriod(new URLSearchParams("period=last3Months"), NOW)).toMatchObject({ period: "last3Months", from: "2026-07-30", to: "2026-10-29", step: "week", whole: true, before: { from: "2026-04-30", to: "2026-07-29" } });
    // A retired period, or days of its own, read as the opening period.
    expect(parseSitePeriod(new URLSearchParams("period=lastQuarter"), NOW).period).toBe("lastMonth");
    expect(parseSitePeriod(new URLSearchParams("period=30"), NOW).period).toBe("lastMonth");
  });

  it("reads custom dates, within today, set against the same number of days before, stepped by their length", () => {
    expect(parseSitePeriod(new URLSearchParams("period=custom&from=2026-09-15&to=2026-10-14"), NOW)).toEqual({
      period: "custom", from: "2026-09-15", to: "2026-10-14", step: "day", whole: true, before: { from: "2026-08-16", to: "2026-09-14" },
    });
    expect(parseSitePeriod(new URLSearchParams("period=custom&from=2026-01-01&to=2026-10-28&step=month"), NOW)).toMatchObject({ period: "custom", step: "month" });
    // Dates past today, back to front, or missing: the opening period instead.
    expect(parseSitePeriod(new URLSearchParams("period=custom&from=2026-10-01&to=2026-11-01"), NOW).period).toBe("lastMonth");
    expect(parseSitePeriod(new URLSearchParams("period=custom&from=2026-10-10&to=2026-10-01"), NOW).period).toBe("lastMonth");
    expect(parseSitePeriod(new URLSearchParams("period=custom&from=2026-10-01"), NOW).period).toBe("lastMonth");
  });

  it("gives a screen that reads a period itself the opening period in place of custom dates", () => {
    expect(periodOrOpening({ period: "custom" }, "lastMonth")).toBe("lastMonth");
    expect(periodOrOpening({ period: "last6Months" }, "lastMonth")).toBe("last6Months");
  });
});
