import { describe, expect, test } from "vitest";
import { stepKey } from "./stepScale";

/**
 * The bucket a chart point is drawn in (calendar periods audit, 2026-10-21): This Year's monthly charts began with a
 * "December 2025" holding only the week of 29 December to 4 January, three of whose days are December's.
 */
describe("a chart point's bucket", () => {
  test("a day is its own day, its week's Monday, or its month", () => {
    expect([stepKey("day", "2026-10-21"), stepKey("week", "2026-10-21"), stepKey("month", "2026-10-21")]).toEqual(["2026-10-21", "2026-10-19", "2026-10"]);
  });

  test("a week held whole that runs into the next month is the month most of its days are in", () => {
    expect(stepKey("month", "2025-12-29", "2026-01-04")).toBe("2026-01");
    expect(stepKey("month", "2026-03-30", "2026-04-05")).toBe("2026-04");
    expect(stepKey("month", "2026-09-28", "2026-10-04")).toBe("2026-10");
    expect(stepKey("month", "2026-06-26", "2026-07-02")).toBe("2026-06");
    // A week inside one month, and a month held whole, stay where they are; a week is still filed by its Monday.
    expect([stepKey("month", "2026-10-05", "2026-10-11"), stepKey("month", "2026-01-01", "2026-01-31")]).toEqual(["2026-10", "2026-01"]);
    expect(stepKey("week", "2025-12-29", "2026-01-04")).toBe("2025-12-29");
  });
});
