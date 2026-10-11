import { describe, expect, test } from "vitest";
import { addUpClarity, clarityRowsFrom } from "./clarityRows";

/**
 * Microsoft Clarity's export, read (insights-analyst-plan.md §7b, phase 15):
 * its list of metrics turned into one row a page, and days added up with each
 * share weighted by its visits.
 */

const ANSWER = [
  { metricName: "Traffic", information: [{ totalSessionCount: "120", URL: "https://www.example.co.uk/" }, { totalSessionCount: "30", URL: "https://www.example.co.uk/ai-agency/" }] },
  { metricName: "ScrollDepth", information: [{ averageScrollDepth: 41.2, URL: "https://www.example.co.uk/" }, { averageScrollDepth: 58, URL: "https://www.example.co.uk/ai-agency/" }] },
  { metricName: "EngagementTime", information: [{ totalTime: 90, activeTime: 62, URL: "https://www.example.co.uk/" }] },
  { metricName: "DeadClickCount", information: [{ sessionsCount: 120, sessionsWithMetricPercentage: 11, subTotal: 14, URL: "https://www.example.co.uk/" }] },
  { metricName: "QuickbackClick", information: [{ sessionsWithMetricPercentage: 7, URL: "https://www.example.co.uk/" }] },
  { metricName: "SomethingNew", information: [{ value: 1, URL: "https://www.example.co.uk/" }] },
];

describe("Clarity's figures", () => {
  test("a row a page, by its path, the most visited first; a metric Hakken doesn't read is left alone", () => {
    expect(clarityRowsFrom(ANSWER, "URL")).toEqual([
      { key: "/", sessions: 120, scroll: 41.2, activeSeconds: 62, dead: 11, rage: null, quickBack: 7, excessiveScroll: null },
      { key: "/ai-agency/", sessions: 30, scroll: 58, activeSeconds: null, dead: null, rage: null, quickBack: null, excessiveScroll: null },
    ]);
    expect(clarityRowsFrom({ error: "unauthorised" }, "URL")).toEqual([]);
  });

  test("days added up: visits summed, shares weighted by each day's visits", () => {
    const [home] = addUpClarity([
      [{ key: "/", sessions: 100, scroll: 40, activeSeconds: 60, dead: 10, rage: null, quickBack: 5, excessiveScroll: null }],
      [{ key: "/", sessions: 300, scroll: 60, activeSeconds: 80, dead: 20, rage: 2, quickBack: null, excessiveScroll: null }],
    ]);
    expect(home).toEqual({ key: "/", sessions: 400, scroll: 55, activeSeconds: 75, dead: 17.5, rage: 2, quickBack: 5, excessiveScroll: null });
  });
});
