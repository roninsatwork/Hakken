import { describe, expect, test } from "vitest";
import { shiftDay } from "./insightFacts";
import {
  OTHER_KEY,
  addUp,
  countingChange,
  countingCheck,
  dayOfGoogle,
  firstMonthKept,
  fromGoogleSearch,
  historyMonths,
  keepMost,
  monthOfGoogle,
  monthsToFetch,
  pathOf,
  shareBetween,
  shiftMonth,
} from "./insightHistory";

/**
 * The research's history (docs/plans/active/insights-intelligence-plan.md;
 * Anthony, 2026-10-12, "go back 16 months"): which months are asked of Google,
 * how a month's list is kept, and the counting check — Analytics' visits from
 * Google against Google's own clicks.
 */

/** Days from one day on, each with its clicks and Analytics' visits from Google. */
function daysFrom(first: string, count: number, clicks: (at: number) => number, visits: (at: number) => number) {
  return Array.from({ length: count }, (_, at) => ({ key: shiftDay(first, at), clicks: clicks(at), googleVisits: visits(at) }));
}

describe("the months asked of Google", () => {
  test("sixteen months back from the newest day, the first cut to the day Google still keeps, the last to the newest day", () => {
    const months = historyMonths("2026-10-09");
    expect(months[0]).toEqual({ month: "2025-06", from: "2025-06-09", to: "2025-06-30" });
    expect(months[months.length - 1]).toEqual({ month: "2026-10", from: "2026-10-01", to: "2026-10-09" });
    expect(months).toHaveLength(17);
    expect(firstMonthKept("2026-10-09")).toBe("2025-06");
  });

  test("asks for months not held, held short of their days, and the newest two always", () => {
    const months = historyMonths("2026-10-09");
    const held = new Map(months.map((month) => [month.month, { from: month.from, to: month.to }]));
    held.delete("2026-01");
    held.set("2025-06", { from: "2025-06-20", to: "2025-06-30" });
    expect(monthsToFetch(months, held).map((month) => month.month)).toEqual(["2025-06", "2026-01", "2026-09", "2026-10"]);
    expect(monthsToFetch(months, new Map())).toHaveLength(17);
  });

  test("months move across a year's end", () => {
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("a month's list as kept", () => {
  test("a page by its path, as both sources name it", () => {
    expect(pathOf("https://www.ronins.co.uk/ai-agency/")).toBe("/ai-agency/");
    expect(pathOf("https://www.ronins.co.uk")).toBe("/");
    expect(pathOf("/ai-agency")).toBe("/ai-agency");
    expect(pathOf("(not set)")).toBe("(not set)");
  });

  test("the same page under two spellings is added up", () => {
    expect(addUp([{ key: "/a/", clicks: 2, impressions: 10 }, { key: "/a/", clicks: 1, impressions: 5 }, { key: "/b/", clicks: 1 }])).toEqual([
      { key: "/a/", clicks: 3, impressions: 15 },
      { key: "/b/", clicks: 1 },
    ]);
  });

  test("keeps the most, and adds up the rest as one so the month's totals stay whole", () => {
    const rows = [{ key: "/c/", visits: 1, enquiries: 1 }, { key: "/a/", visits: 9, enquiries: 0 }, { key: "/b/", visits: 5, enquiries: 2 }, { key: "/d/", visits: 1 }];
    const kept = keepMost(rows, 3);
    expect(kept.map((row) => row.key)).toEqual(["/a/", "/b/", OTHER_KEY]);
    expect(kept[2]).toEqual({ key: OTHER_KEY, visits: 2, enquiries: 1 });
    expect(keepMost(rows, 10)).toHaveLength(4);
  });

  test("reads Analytics' days and months, and its visits from Google's own search", () => {
    expect(dayOfGoogle("20260803")).toBe("2026-08-03");
    expect(monthOfGoogle("202608")).toBe("2026-08");
    expect(fromGoogleSearch("Organic Search", "google")).toBe(true);
    expect(fromGoogleSearch("Organic Search", "bing")).toBe(false);
    expect(fromGoogleSearch("Referral", "google")).toBe(false);
  });
});

describe("the counting check", () => {
  test("finds the day Analytics began seeing fewer of Google's clicks, and stays with it", () => {
    // 20 clicks a day; Analytics saw 16 of them until day 120, then 10.
    const days = daysFrom("2026-01-01", 200, () => 20, (at) => (at < 120 ? 16 : 10));
    const change = countingChange(days);
    expect(change?.changedOn).toBe(shiftDay("2026-01-01", 120));
    expect(change?.before).toBeCloseTo(0.8);
    expect(change?.after).toBeCloseTo(0.5);
  });

  test("a month's dip that comes back is not a change", () => {
    // Ronins' June 2026: the share fell for four weeks and came back.
    const days = daysFrom("2026-01-01", 240, () => 20, (at) => (at >= 120 && at < 148 ? 7 : 11));
    expect(countingChange(days)).toBeNull();
  });

  test("says nothing on too few clicks, or across days missing", () => {
    expect(countingChange(daysFrom("2026-01-01", 200, () => 1, (at) => (at < 120 ? 1 : 0)))).toBeNull();
    const gapped = daysFrom("2026-01-01", 200, () => 20, (at) => (at < 120 ? 16 : 10)).filter((_, at) => at % 2 === 0);
    expect(countingChange(gapped)).toBeNull();
  });

  test("the share now against the same 90 days a year before shows a slow drift no single day does", () => {
    // Analytics' share eases from 0.62 to 0.49 over a year and a half, never in one step.
    const count = 490;
    const days = daysFrom("2025-06-10", count, () => 12, (at) => 12 * (0.65 - (0.18 * at) / count));
    const check = countingCheck(days);
    expect(check.step).toBeNull();
    expect(check.now?.share).toBeLessThan(0.5);
    expect(check.yearAgo?.share).toBeGreaterThan(0.58);
    expect(check.now?.to).toBe(shiftDay("2025-06-10", count - 1));
  });

  test("leaves out days one source has not filled in, and a span with too few days", () => {
    const days = [...daysFrom("2026-01-01", 90, () => 10, () => 5), { key: "2026-04-01", googleVisits: 3 }];
    expect(shareBetween(days, "2026-01-01", "2026-04-01")?.share).toBeCloseTo(0.5);
    expect(shareBetween(days, "2026-03-01", "2026-04-01")).toBeNull();
  });
});
