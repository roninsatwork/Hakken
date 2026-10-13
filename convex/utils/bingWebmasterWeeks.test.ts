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

  test("a period is its newest weeks, and the period before it the weeks before those", () => {
    const held = ["2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06", "2026-08-30", "2026-08-23", "2026-08-16", "2026-08-09"];
    expect(weeksOf(held, "7", "NOW")).toEqual({ weeks: ["2026-10-04"], from: "2026-09-28", to: "2026-10-04" });
    expect(weeksOf(held, "30", "NOW")).toEqual({ weeks: ["2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13"], from: "2026-09-07", to: "2026-10-04" });
    expect(weeksOf(held, "30", "BEFORE")?.weeks).toEqual(["2026-09-06", "2026-08-30", "2026-08-23", "2026-08-16"]);
    expect(weeksOf(held, "90", "BEFORE")).toBeNull();
    expect(weeksOf([], "7", "NOW")).toBeNull();
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
