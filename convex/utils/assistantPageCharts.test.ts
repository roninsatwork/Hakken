import { describe, expect, it } from "vitest";
import { toCsv } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { chartFromToolCalls } from "./assistantCharts";
import { keptCharts, pageChartFrom, pageChartLines, tableFromCsv } from "./assistantPageCharts";
import { startedOnLines } from "./startedOn";

/**
 * Ask Hakken redraws any chart on the page a conversation started on (ask-hakken-every-chart-page-plan-2026-11-03.md,
 * shared work 9): from the figures the chart's own download holds, read back, never the model's.
 */
const channels = tableFromCsv("Visits by channel", toCsv(["Channel", "Visits", "Visits before", "Note"], [
  ["Organic Search", 4000, 3900, "steady"],
  ["Referral", 1640, 1000, null],
  ["Direct", 1200, 2000, "fell, sharply"],
  ["=cmd", 10, 4, "quoted \"as\" said"],
]))!;

describe("a chart on the page, redrawn", () => {
  it("reads a chart's download back: quotes, commas, a cell kept from reading as a formula, numbers as numbers", () => {
    expect(channels.columns).toEqual(["Channel", "Visits", "Visits before", "Note"]);
    expect(channels.rows).toEqual([
      ["Organic Search", 4000, 3900, "steady"],
      ["Referral", 1640, 1000, null],
      ["Direct", 1200, 2000, "fell, sharply"],
      ["=cmd", 10, 4, "quoted \"as\" said"],
    ]);
  });

  it("draws the top so many as bars, biggest first, a column of figures set beside it as the period before", () => {
    const drawn = pageChartFrom(channels, { kind: "bars", top: 2, against: "visits before", link: "/app/analytics/s1/channels" });
    expect(drawn).toEqual({ ok: true, chart: {
      look: "pageChart", kind: "bars", title: "Visits by channel", measure: "Visits", against: "Visits before",
      groups: [{ name: "Organic Search", value: 4000, before: 3900 }, { name: "Referral", value: 1640, before: 1000 }],
      link: "/app/analytics/s1/channels",
    } });
    // It goes under the answer like any other chart.
    const resultJson = JSON.stringify({ status: "SUCCESS", data: drawn });
    expect(chartFromToolCalls([{ handlerMapping: "assistant.pageChart", status: "SUCCESS", resultJson }])).toEqual(drawn.ok && drawn.chart);
  });

  it("a chart by day stays a line in the page's order; a column it doesn't hold is said with the ones it does", () => {
    const days = tableFromCsv("Visits by day", toCsv(["Day", "New", "Returning"], [["2026-10-01", 749, 354], ["2026-10-02", 708, 304]]))!;
    const line = pageChartFrom(days, { measure: "returning", link: "/x" });
    expect(line).toMatchObject({ ok: true, chart: { kind: "line", measure: "Returning", groups: [{ name: "2026-10-01", value: 354 }, { name: "2026-10-02", value: 304 }] } });
    expect(pageChartFrom(days, { measure: "money", link: "/x" })).toEqual({ ok: false, problem: "\"Visits by day\" has no column of figures called \"money\". Its columns: Day, New, Returning." });
  });

  it("is told to Ask Hakken by number, title and columns, and kept to its size", () => {
    expect(pageChartLines([channels])).toEqual(["1. Visits by channel — columns: Channel, Visits, Visits before, Note (4 rows)"]);
    const lines = startedOnLines({ path: "/app/analytics/s1/channels", about: "Channels", dates: "lastMonth", findings: [], said: [], charts: [channels] });
    expect(lines).toContain("redraw it with redraw_page_chart by its number");
    expect(lines).toContain("1. Visits by channel");
    const many = Array.from({ length: 30 }, () => ({ ...channels, rows: Array.from({ length: 500 }, () => ["x", 1, 2, "y"]) }));
    const kept = keptCharts(many);
    expect(kept).toHaveLength(12);
    expect(kept[0].rows).toHaveLength(200);
  });
});

describe("a chart under an answer, from every source", () => {
  it("keeps Bing's, Clarity's and Visibility's charts of groups too, which were drawn and then dropped (2026-11-03)", () => {
    const groups = (look: string, measure: string, by: string) => ({ look, kind: "bars", by, measure, website: "example.co.uk", period: "lastMonth", groups: [{ name: "a", value: 3 }], link: "/x" });
    for (const chart of [groups("bingGroups", "clicks", "query"), groups("clarityGroups", "scroll", "device"), groups("visibilityGroups", "searches", "website")]) {
      expect(chartFromToolCalls([{ handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: JSON.stringify({ status: "SUCCESS", data: { ok: true, chart } }) }])).toEqual(chart);
    }
  });

  it("draws a map of up to forty boxes, each with its span before for its colour", () => {
    const rows = Array.from({ length: 45 }, (_, at) => [`Page ${at}`, 100 - at, 90]);
    const drawn = pageChartFrom({ title: "A map of your pages", columns: ["Page", "Visits", "Visits before"], rows }, { kind: "map", measure: "Visits", against: "Visits before", link: "/x" });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.chart.kind).toBe("map");
    expect(drawn.chart.groups).toHaveLength(40);
    expect(drawn.chart.groups[0]).toEqual({ name: "Page 0", value: 100, before: 90 });
  });

  it("keeps days in order as bars, and all of them, unless only the biggest few are asked for", () => {
    const table = { title: "Views each day", columns: ["Day", "Home page"], rows: Array.from({ length: 31 }, (_, at) => [`2026-10-${String(at + 1).padStart(2, "0")}`, (at * 7) % 31]) };
    const bars = pageChartFrom(table, { kind: "bars", link: "/x" });
    expect(bars.ok && bars.chart.groups.map((group) => group.name)).toEqual(table.rows.map((row) => row[0]));
    const top = pageChartFrom(table, { kind: "bars", top: 3, link: "/x" });
    expect(top.ok && top.chart.groups.map((group) => group.value)).toEqual([30, 29, 28]);
  });
});
