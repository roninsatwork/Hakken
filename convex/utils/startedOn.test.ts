import { describe, expect, it } from "vitest";
import { startedOnLines } from "./startedOn";

/** What Ask Hakken is told of the page a conversation started on (sees-side-panel-plan-2026-10-31.md, phase 3). */
describe("the page a conversation started on", () => {
  it("names the page and its dates, says what \"this\" means, and lists what code found and what the eye said", () => {
    const lines = startedOnLines({
      path: "/app/analytics/s1/conversions", about: "Conversions: what this shop counts", dates: "lastMonth",
      findings: ["9.2% of Paid Search visits did purchase, above the website's 3.4%."], said: ["Phones add to basket less."],
    });
    expect(lines).toContain("Conversions: what this shop counts (/app/analytics/s1/conversions), lastMonth.");
    expect(lines).toContain("they mean this page and its figures");
    expect(lines).toContain("never repeat a number from below unchecked");
    expect(lines).toContain("- 9.2% of Paid Search visits did purchase");
    expect(lines).toContain("- Phones add to basket less.");
  });
});
