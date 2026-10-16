import { describe, expect, test } from "vitest";
import { addTotals, clarityTotalsFrom, emptyTotals, rowOf } from "./clarityRows";

/**
 * Microsoft Clarity's export, read (insights-analyst-plan.md §7b, phase 15;
 * agents-and-clarity-plan.md, Part 0): its list of metrics turned into totals
 * a page on a device or a device, bots kept apart, and the screens' averages
 * worked out from the totals.
 */

const site = (path: string) => `https://www.example.co.uk${path}`;

describe("Clarity's figures, read as totals", () => {
  test("each page on each device under its own path, bots taken out of the visits, shares turned into visits", () => {
    const answer = [
      { metricName: "Traffic", information: [
        { totalSessionCount: "130", totalBotSessionCount: "10", distantUserCount: "100", PagesPerSessionPercentage: 1.5, Url: site("/?utm_source=x"), Device: "PC" },
        { totalSessionCount: "30", totalBotSessionCount: "0", distantUserCount: "28", Url: site("/ai-agency/"), Device: "Mobile" },
        { totalSessionCount: "5", totalBotSessionCount: "5", Url: site("/wp-login.php"), Device: "PC" },
      ] },
      { metricName: "ScrollDepth", information: [{ averageScrollDepth: 41.25, Url: site("/"), Device: "PC" }, { averageScrollDepth: 20, Url: site("/ai-agency/"), Device: "Mobile" }] },
      { metricName: "EngagementTime", information: [{ totalTime: 90, activeTime: 62, Url: site("/"), Device: "PC" }] },
      { metricName: "DeadClickCount", information: [{ sessionsWithMetricPercentage: 10, Url: site("/"), Device: "PC" }] },
      { metricName: "QuickbackClick", information: [{ sessionsWithMetricPercentage: 10, Url: site("/ai-agency/"), Device: "Mobile" }] },
      { metricName: "ScriptErrorCount", information: [{ sessionsWithMetricPercentage: 6.67, Url: site("/ai-agency/"), Device: "Mobile" }] },
      { metricName: "SomethingNew", information: [{ value: 1, Url: site("/"), Device: "PC" }] },
    ];
    const rows = clarityTotalsFrom(answer, "URL,Device");
    // The page only bots visited is left out; the query string is not a page of its own.
    expect(rows.map((row) => [row.page, row.device, row.visits, row.bots])).toEqual([["/", "PC", 120, 10], ["/ai-agency/", "Mobile", 30, 0]]);
    expect(rows[0]).toMatchObject({ scrollSum: Math.round(41.25 * 10 * 120), activeSum: 62 * 120, dead: 12, users: 100, pagesSum: 150 * 120 });
    expect(rows[1]).toMatchObject({ scrollSum: 20 * 10 * 30, quickBack: 3, errors: 2, activeSum: 0 });
  });

  test("the page's address is found whatever its field is called — reading \"URL\" alone filed every page as \"/\" (2026-10-16)", () => {
    for (const name of ["URL", "Url", "url", "PageUrl", "Page URL"]) {
      const rows = clarityTotalsFrom([{ metricName: "Traffic", information: [{ totalSessionCount: "4", [name]: site("/about-us/"), Device: "Tablet" }] }], "URL,Device");
      expect(rows.map((row) => row.page)).toEqual(["/about-us/"]);
    }
    const unnamed = clarityTotalsFrom([{ metricName: "Traffic", information: [{ totalSessionCount: "4", Address: site("/journal/"), Device: "PC" }] }], "URL,Device");
    expect(unnamed.map((row) => row.page)).toEqual(["/journal/"]);
  });

  test("by device across the website, the bots kept even on a device only bots used; nothing from an answer that is not a list", () => {
    const rows = clarityTotalsFrom([{ metricName: "Traffic", information: [
      { totalSessionCount: "200", totalBotSessionCount: "20", Device: "PC" },
      { totalSessionCount: "8", totalBotSessionCount: "8", Device: "Other" },
    ] }], "Device");
    expect(rows.map((row) => [row.page, row.device, row.visits, row.bots])).toEqual([[null, "PC", 180, 20], [null, "Other", 0, 8]]);
    expect(clarityTotalsFrom({ error: "unauthorised" }, "Device")).toEqual([]);
  });

  test("totals add up by plain addition, and the screens' averages come from them: one number however the days are cut", () => {
    const monday = { ...emptyTotals(), visits: 100, scrollSum: 40 * 10 * 100, activeSum: 60 * 100, dead: 10, quickBack: 5 };
    const tuesday = { ...emptyTotals(), visits: 300, scrollSum: 60 * 10 * 300, activeSum: 80 * 300, dead: 60, rage: 6 };
    const both = addTotals(addTotals(emptyTotals(), monday), tuesday);
    expect(rowOf("/", both)).toEqual({ key: "/", sessions: 400, scroll: 55, activeSeconds: 75, dead: 17.5, rage: 1.5, quickBack: 1.3, excessiveScroll: 0 });
    expect(rowOf("/", emptyTotals())).toMatchObject({ sessions: 0, scroll: null, dead: null });
  });
});
