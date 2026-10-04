import { describe, expect, test } from "vitest";
import { chartFigures, keptIn, periodSpan, spanBefore, type Kept } from "./searchConsolePeriods";
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

describe("the days, weeks and months the charts read", () => {
  const pairs = (rows: [string, string, number, number, number][]) =>
    pack(rows.map(([key, page, clicks, impressions, position]) => ({ key, page, clicks, impressions, positionSum: position * impressions })), true)[0];
  // Held from Wednesday 10 June; days kept as days from Monday 29 June, the 90-day line.
  const OLDEST = "2026-06-10";
  const kept: Kept[] = [
    { grain: "WEEK", start: "2026-06-08", packed: pairs([["early", "/", 1, 10, 15]]) },
    { grain: "WEEK", start: "2026-06-22", packed: pairs([["ronins", "/", 4, 10, 1]]) },
    { grain: "DAY", start: "2026-06-29", packed: pairs([["ronins", "/", 2, 10, 2]]) },
    { grain: "DAY", start: "2026-07-01", packed: pairs([["ai agency", "/ai/", 3, 100, 8]]) },
    { grain: "DAY", start: NEWEST, packed: pairs([["web design", "/", 0, 50, 40]]) },
  ];
  const built = chartFigures(kept, NEWEST, OLDEST, ["Ronins"], 16);
  const of = (grain: Kept["grain"], start: string) => built.find((row) => row.grain === grain && row.week === start);

  test("days only from the 90-day line, weeks and months as far as the charts reach", () => {
    const days = built.filter((row) => row.grain === "DAY");
    expect([days[0].week, days.at(-1)?.week, days.length]).toEqual(["2026-06-29", NEWEST, 90]);
    expect(built.filter((row) => row.grain === "WEEK").map((row) => row.week)).toEqual([
      "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27",
      "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21",
    ]);
    expect(built.filter((row) => row.grain === "MONTH").map((row) => row.week)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  test("each one's keywords by band and brand clicks, from the records counting towards it", () => {
    expect(of("DAY", "2026-06-29")).toMatchObject({ top3: 1, top10: 0, brandClicks: 2, otherClicks: 0, days: 1 });
    expect(of("DAY", "2026-06-30")).toMatchObject({ top3: 0, top10: 0, top20: 0, rest: 0 });
    expect(of("WEEK", "2026-06-29")).toMatchObject({ top3: 1, top10: 1, brandClicks: 2, otherClicks: 3 });
    expect(of("WEEK", "2026-06-22")).toMatchObject({ top3: 1, brandClicks: 4 });
    // June: two rolled-up weeks and its last day kept as a day; "ronins" in both counts once, at its average.
    expect(of("MONTH", "2026-06-01")).toMatchObject({ top3: 1, top20: 1, brandClicks: 6, otherClicks: 1 });
    expect(of("MONTH", "2026-09-01")).toMatchObject({ rest: 1, otherClicks: 0 });
  });

  test("a week or month at an edge of the history holds only some of its days", () => {
    expect(of("WEEK", "2026-06-08")?.days).toBe(5);
    expect(of("WEEK", "2026-06-15")?.days).toBe(7);
    expect(of("WEEK", "2026-09-21")?.days).toBe(6);
    expect(of("MONTH", "2026-06-01")?.days).toBe(21);
    expect(of("MONTH", "2026-07-01")?.days).toBe(31);
    expect(of("MONTH", "2026-09-01")?.days).toBe(26);
  });

  test("the charts' weeks limit how far back they reach", () => {
    const eight = chartFigures(kept, NEWEST, OLDEST, ["Ronins"], 8);
    expect(eight.filter((row) => row.grain === "WEEK")[0].week).toBe("2026-08-03");
    expect(eight.filter((row) => row.grain === "DAY")[0].week).toBe("2026-08-03");
    expect(eight.filter((row) => row.grain === "MONTH")[0].week).toBe("2026-08-01");
  });
});
