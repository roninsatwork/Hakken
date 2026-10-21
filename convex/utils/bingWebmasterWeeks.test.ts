import { describe, expect, test } from "vitest";
import {
  BING_PART_ROWS,
  addUpRows,
  fingerprintRows,
  keywordMatch,
  oldestWeekKept,
  packBingRows,
  pageNumberOf,
  pageRefOf,
  positionOfRow,
  rowsOfBingPart,
  shiftBingDay,
  weeksOf,
} from "./bingWebmasterWeeks";

/** Bing's weeks kept and added up as Search Console's lists are (docs/plans/active/bing-webmaster-plan.md §4.2–§4.4). */

describe("packing a week", () => {
  test("rows come back as they went in, busiest first", () => {
    const rows = [
      { key: 7, clicks: 1, impressions: 4, positionSum: 20 },
      { key: 3, clicks: 5, impressions: 41, positionSum: 179 },
      { key: 9, clicks: 1, impressions: 10, positionSum: 51 },
    ];
    const parts = packBingRows(rows);
    expect(parts).toHaveLength(1);
    expect(rowsOfBingPart(parts[0]).map((row) => row.key)).toEqual([3, 9, 7]);
    expect(rowsOfBingPart(parts[0])[0]).toEqual({ key: 3, clicks: 5, impressions: 41, positionSum: 179 });
  });

  test("a big week splits into parts of 2,000; an empty week is one empty part", () => {
    const rows = Array.from({ length: BING_PART_ROWS + 5 }, (_, key) => ({ key, clicks: 0, impressions: 1, positionSum: 1 }));
    expect(packBingRows(rows)).toHaveLength(2);
    expect(packBingRows([])).toEqual([{ keys: "", clicks: "", impressions: "", positionSums: "" }]);
  });

  test("an unchanged week has the same fingerprint, whatever order Bing sent it in", async () => {
    const one = [{ key: 1, clicks: 2, impressions: 3, positionSum: 4 }, { key: 2, clicks: 0, impressions: 9, positionSum: 40 }];
    expect(await fingerprintRows(one)).toBe(await fingerprintRows([...one].reverse()));
    expect(await fingerprintRows(one)).not.toBe(await fingerprintRows([{ ...one[0], clicks: 3 }, one[1]]));
  });
});

describe("adding weeks up", () => {
  test("a keyword's weeks add up, and its position is the average when shown", () => {
    const rows = addUpRows([
      [{ key: 1, clicks: 2, impressions: 10, positionSum: 40 }],
      [{ key: 1, clicks: 3, impressions: 30, positionSum: 150 }, { key: 2, clicks: 0, impressions: 1, positionSum: 7 }],
    ]);
    expect(rows).toEqual([{ key: 1, clicks: 5, impressions: 40, positionSum: 190 }, { key: 2, clicks: 0, impressions: 1, positionSum: 7 }]);
    expect(positionOfRow(rows[0])).toBe(4.75);
    expect(positionOfRow({ impressions: 0, positionSum: 0 })).toBeNull();
  });

  test("a calendar period is the Bing weeks ending inside it, set against the weeks of the span before (calendar-periods-plan.md, phase 5)", () => {
    // Bing's weeks dated by their last day, Sundays here, from 28 June to 18 October; today Wednesday 21 October.
    const held = Array.from({ length: 17 }, (_, index) => shiftBingDay("2026-06-28", index * 7));
    const today = "2026-10-21";
    expect(weeksOf(held, "lastWeek", "NOW", today)).toEqual({ weeks: ["2026-10-18"], from: "2026-10-12", to: "2026-10-18" });
    expect(weeksOf(held, "lastWeek", "BEFORE", today)?.weeks).toEqual(["2026-10-11"]);
    // No Bing week has ended inside this week yet.
    expect(weeksOf(held, "thisWeek", "NOW", today)).toBeNull();
    // A month's first week may begin in the month before, and the list says so by its dates.
    expect(weeksOf(held, "lastMonth", "NOW", today)).toEqual({ weeks: ["2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06"], from: "2026-08-31", to: "2026-09-27" });
    expect(weeksOf(held, "lastMonth", "BEFORE", today)?.weeks).toEqual(["2026-08-30", "2026-08-23", "2026-08-16", "2026-08-09", "2026-08-02"]);
    // A month still going is set against the same days of the one before: 1–18 September for 1–18 October.
    expect(weeksOf(held, "thisMonth", "NOW", today)?.weeks).toEqual(["2026-10-18", "2026-10-11", "2026-10-04"]);
    expect(weeksOf(held, "thisMonth", "BEFORE", today)?.weeks).toEqual(["2026-09-13", "2026-09-06"]);
    expect(weeksOf(held, "lastQuarter", "NOW", today)?.weeks).toHaveLength(13);
    expect(weeksOf(held, "lastQuarter", "BEFORE", today)?.weeks).toEqual(["2026-06-28"]);
    expect(weeksOf([], "lastWeek", "NOW", today)).toBeNull();
  });

  test("weeks are kept 13 months behind the newest", () => {
    expect(oldestWeekKept("2026-10-04")).toBe("2025-09-03");
  });
});

describe("names", () => {
  test("a page's number and its reference in the website's numbering", () => {
    expect(pageNumberOf("~1a")).toBe(46);
    expect(pageRefOf(46)).toBe("~1a");
  });

  test("two engines' keywords are matched in lower case with single spaces", () => {
    expect(keywordMatch("  What is a  Brand Audit ")).toBe("what is a brand audit");
  });
});
