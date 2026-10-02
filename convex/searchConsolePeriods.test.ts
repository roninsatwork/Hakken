import { describe, expect, test } from "vitest";
import { keptIn, periodSpan, spanBefore, type Kept } from "./searchConsolePeriods";
import { pack, type Packed } from "./utils/searchConsolePacks";

/**
 * The ready-made periods' days (docs/plans/active/search-console-plan.md
 * §14.3, item 4): each ends on the newest day held, never reaches before the
 * oldest, and counts each day once — days, then the weeks and months they
 * were rolled into.
 */

const NEWEST = "2026-09-26";

describe("a period's days", () => {
  test("ends on the newest day held, never before the oldest", () => {
    expect(periodSpan("7", NEWEST, "2026-06-29")).toEqual({ from: "2026-09-20", to: NEWEST });
    expect(periodSpan("90", NEWEST, "2026-06-29")).toEqual({ from: "2026-06-29", to: NEWEST });
    // Twelve months of a website held for 90 days: the 90 days.
    expect(periodSpan("365", NEWEST, "2026-06-29")).toEqual({ from: "2026-06-29", to: NEWEST });
    expect(periodSpan("365", NEWEST, "2024-01-01")).toEqual({ from: "2025-09-27", to: NEWEST });
  });

  test("the period before is the same days just before, only when every one is held; twelve months has none", () => {
    expect(spanBefore("7", NEWEST, "2026-06-29")).toEqual({ from: "2026-09-13", to: "2026-09-19" });
    expect(spanBefore("30", NEWEST, "2026-06-29")).toEqual({ from: "2026-07-29", to: "2026-08-27" });
    expect(spanBefore("90", NEWEST, "2026-06-29")).toBeNull();
    expect(spanBefore("90", NEWEST, "2026-03-31")).toEqual({ from: "2026-03-31", to: "2026-06-28" });
    expect(spanBefore("365", NEWEST, "2024-01-01")).toBeNull();
  });
});

describe("what counts towards a period", () => {
  const packed = (key: string): Packed => pack([{ key, clicks: 1, impressions: 1, positionSum: 1 }], false)[0];
  const kept = (grain: Kept["grain"], start: string): Kept => ({ grain, start, packed: packed(`${grain} ${start}`) });
  const counted = (records: Kept[], span: { from: string; to: string }) => keptIn(records, span, NEWEST).map((part) => part.keys[0]);

  test("its days, and none outside it", () => {
    const records = [kept("DAY", "2026-09-19"), kept("DAY", "2026-09-20"), kept("DAY", NEWEST)];
    expect(counted(records, { from: "2026-09-20", to: NEWEST })).toEqual(["DAY 2026-09-20", `DAY ${NEWEST}`]);
  });

  test("the week the 90-day line falls in holds only the days before it, so counts towards the period before", () => {
    // 2026-09-30 newest: days from 2026-07-03, a Friday, are kept as days;
    // Monday to Thursday of that week were rolled into the week of 2026-06-29.
    const newest = "2026-09-30";
    const records = [kept("WEEK", "2026-06-22"), kept("WEEK", "2026-06-29"), kept("DAY", "2026-07-03"), kept("DAY", newest)];
    const ninety = periodSpan("90", newest, "2026-01-01");
    expect(ninety.from).toBe("2026-07-03");
    expect(keptIn(records, ninety, newest).map((part) => part.keys[0])).toEqual(["DAY 2026-07-03", `DAY ${newest}`]);
    const before = spanBefore("90", newest, "2026-01-01")!;
    expect(before).toEqual({ from: "2026-04-04", to: "2026-07-02" });
    expect(keptIn(records, before, newest).map((part) => part.keys[0])).toEqual(["WEEK 2026-06-22", "WEEK 2026-06-29"]);
  });

  test("a week or month at the far edge counts when most of its days are inside", () => {
    // From Thursday 2026-04-02: the week of 30 March has four of its seven days inside, that of 23 March none.
    const records = [kept("WEEK", "2026-03-23"), kept("WEEK", "2026-03-30"), kept("WEEK", "2026-04-06")];
    expect(counted(records, { from: "2026-04-02", to: "2026-06-28" })).toEqual(["WEEK 2026-03-30", "WEEK 2026-04-06"]);
    expect(counted(records, { from: "2026-04-03", to: "2026-06-28" })).toEqual(["WEEK 2026-04-06"]);
    const months = [kept("MONTH", "2025-09-01"), kept("MONTH", "2025-10-01")];
    expect(counted(months, { from: "2025-09-27", to: NEWEST })).toEqual(["MONTH 2025-10-01"]);
    expect(counted(months, { from: "2025-09-12", to: NEWEST })).toEqual(["MONTH 2025-09-01", "MONTH 2025-10-01"]);
  });
});
