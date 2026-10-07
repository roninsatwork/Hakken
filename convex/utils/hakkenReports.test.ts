import { describe, expect, it } from "vitest";
import { pickPages, reportCount, reportTitle, signed, weekdayOf } from "./hakkenReports";

/** A Hakken report's rules (hakken-tasks-plan.md, item 4.1, board EmailReportB). */
describe("a Hakken report", () => {
  it("says what it sends in plain words", () => {
    expect(reportTitle({ look: "pagesChange", direction: "lost", count: 5, every: "week", weekday: 1 }, "visitors"))
      .toBe("Every Monday, send me the five pages that lost the most visitors");
    expect(reportTitle({ look: "pagesChange", direction: "gained", count: 3, every: "week", weekday: 5 }, "impressions"))
      .toBe("Every Friday, send me the three pages that gained the most impressions");
  });

  it("holds the pages that moved its way, most first", () => {
    const rows = [
      { page: "/a/", now: 412, before: 508 },
      { page: "/b/", now: 188, before: 249 },
      { page: "/c/", now: 50, before: 20 },
      { page: "/d/", now: 141, before: 171 },
    ];
    expect(pickPages(rows, "lost", 2).map((row) => [row.page, row.change])).toEqual([["/a/", -96], ["/b/", -61]]);
    expect(pickPages(rows, "gained", 5).map((row) => [row.page, row.change])).toEqual([["/c/", 30]]);
  });

  it("reads a weekday and a count as people say them, within bounds", () => {
    expect([weekdayOf("monday"), weekdayOf("Fri"), weekdayOf(7), weekdayOf("someday")]).toEqual([1, 5, 7, 1]);
    expect([reportCount(5), reportCount(1), reportCount(40), reportCount(undefined)]).toEqual([5, 3, 10, 5]);
  });

  it("writes a change with a real minus sign", () => {
    expect([signed(-224), signed(96), signed(0), signed(-1204)]).toEqual(["−224", "+96", "0", "−1,204"]);
  });
});
