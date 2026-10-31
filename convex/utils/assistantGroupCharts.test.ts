import { describe, expect, test } from "vitest";
import { EVERY_OTHER, groupsChartFrom, hoursGridFrom, searchGroupsChartFrom, type GroupsView } from "./assistantGroupCharts";

/**
 * Charts of groups (ask-hakken-every-chart-plan-2026-10-31.md, phase 1), on figures shaped like morehandles.co.uk's
 * September by channel (read from the saved map on 2026-10-31): each kind worked out in code from the map's view.
 */

const visits = [
  ["Organic Search", 12_809, 13_382], ["Cross-network", 10_720, 9_020], ["Direct", 4_491, 4_226], ["Paid Shopping", 4_386, 4_167],
  ["Paid Search", 1_198, 1_143], ["AI Assistant", 987, 795], ["Organic Shopping", 791, 572], ["Referral", 756, 629], ["(not set)", 40, 30],
] as const;
const purchases: Record<string, [number, number]> = {
  "Organic Search": [288, 281], "Cross-network": [413, 333], Direct: [190, 164], "Paid Shopping": [159, 135], "Paid Search": [110, 90],
  "AI Assistant": [32, 29], "Organic Shopping": [34, 20], Referral: [14, 12], "(not set)": [6, 1],
};
const rate = (did: number, of: number) => Math.round((did / of) * 1000) / 10;
const conversion = (event: string, share: number) => ({
  event,
  visitsThatDidIt: visits.reduce((sum, [column, now]) => sum + (event === "purchase" ? purchases[column][0] : Math.round(now * share)), 0),
  by: visits.map(([column, now, before]) => {
    const did = event === "purchase" ? purchases[column][0] : Math.round(now * share);
    const didBefore = event === "purchase" ? purchases[column][1] : Math.round(before * share);
    return { column, visitsThatDidIt: did, visitsThatDidItBefore: didBefore, ratePercent: rate(did, now), ratePercentBefore: rate(didBefore, before) };
  }),
});
const view: GroupsView = {
  visits: visits.map(([column, now, before]) => ({ column, visits: now, visitsBefore: before })),
  conversions: [conversion("add_to_cart", 0.142), conversion("purchase", 0), conversion("newsletter_sign_ups", 0.026)],
};
const ask = { by: "channel" as const, website: "morehandles.co.uk", period: "lastMonth", link: "/app/analytics/site/conversions?period=lastMonth" };

describe("charts of a website's groups, worked out in code", () => {
  test("bars rank the groups by visits, the period before beside each, and leave out what no one can act on", () => {
    const built = groupsChartFrom(view, { ...ask, kind: "bars", measure: "visits" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.chart).toMatchObject({ look: "analyticsGroups", kind: "bars", by: "channel", measure: "visits", website: "morehandles.co.uk" });
    expect(built.chart.event).toBeUndefined();
    expect(built.chart.groups[0]).toEqual({ name: "Organic Search", value: 12_809, before: 13_382 });
    expect(built.chart.groups.map((group) => group.name)).not.toContain("(not set)");
  });

  test("a rate is of a shop's purchase when none is named, and only for groups with visits to trust", () => {
    const built = groupsChartFrom(view, { ...ask, kind: "bars", measure: "conversionRate" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart.event).toBe("purchase");
    expect(built.chart.groups[0]).toEqual({ name: "Paid Search", value: 9.2, before: 7.9 });
    // A fiftieth of the website's visits is 724: Referral's 756 counts; (not set)'s 40 never does.
    expect(built.chart.groups.every((group) => group.value > 0)).toBe(true);
    expect(built.chart.groups.map((group) => group.name)).not.toContain("(not set)");
  });

  test("a pie's and stacked bars' shares add up to the whole, the smaller groups together as every other", () => {
    for (const kind of ["pie", "stacked"] as const) {
      const built = groupsChartFrom(view, { ...ask, kind, measure: "visits" });
      if (!built.ok) throw new Error(built.problem);
      expect(built.chart.groups).toHaveLength(6);
      // 12,809 of 36,178 visits here; 13,382 of 33,964 the month before.
      expect(built.chart.groups[0]).toEqual({ name: "Organic Search", value: 35.4, before: 39.4 });
      expect(built.chart.groups.at(-1)?.name).toBe(EVERY_OTHER);
      const total = built.chart.groups.reduce((sum, group) => sum + group.value, 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.5);
    }
    // A share of a rate means nothing: it is drawn as a share of visits.
    const asked = groupsChartFrom(view, { ...ask, kind: "pie", measure: "conversionRate" });
    expect(asked.ok && asked.chart.measure).toBe("visits");
  });

  test("a scatter sets each trusted group's visits against its purchase rate", () => {
    const built = groupsChartFrom(view, { ...ask, kind: "scatter", measure: "visits" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart).toMatchObject({ measure: "conversionRate", event: "purchase" });
    expect(built.chart.groups.find((group) => group.name === "Paid Search")).toEqual({ name: "Paid Search", value: 9.2, visits: 1_198 });
    // A fiftieth of the website's visits is 724: Organic Shopping's 791 counts, (not set)'s 40 never does.
    expect(built.chart.groups.map((group) => group.name)).toContain("Organic Shopping");
    expect(built.chart.groups.map((group) => group.name)).not.toContain("(not set)");
  });

  test("a grid lays each conversion's rate across the groups, the main conversion first", () => {
    const built = groupsChartFrom(view, { ...ask, kind: "grid", measure: "visits" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart.rows?.map((row) => row.event)).toEqual(["purchase", "add_to_cart", "newsletter_sign_ups"]);
    expect(built.chart.groups[0].name).toBe("Organic Search");
    expect(built.chart.rows?.[0].values[0]).toBe(2.2);
  });

  test("a conversion the website doesn't count is said, never drawn", () => {
    const built = groupsChartFrom(view, { ...ask, kind: "bars", measure: "conversions", event: "generate_lead" });
    expect(built).toEqual({ ok: false, problem: expect.stringContaining("generate_lead is not one of the conversions") });
  });
});

describe("Search Console's groups and the week's hours (the plan's gaps)", () => {
  const searches = [
    { key: "cupboard handles", clicks: 420, impressions: 9_000, ctr: 0.0467, previousClicks: 380 },
    { key: "door handles", clicks: 300, impressions: 12_000, ctr: 0.025, previousClicks: 310 },
    { key: "brass knobs", clicks: 90, impressions: 1_500, ctr: 0.06, previousClicks: 60 },
    { key: "hinges", clicks: 10, impressions: 80, ctr: 0.125, previousClicks: null },
  ];
  const ask = { by: "query" as const, website: "morehandles.co.uk", period: "lastMonth", link: "/app/search-console/site/keywords" };

  test("bars rank the searches by clicks, the period before beside each", () => {
    const built = searchGroupsChartFrom(searches, { ...ask, kind: "bars", measure: "clicks" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart).toMatchObject({ look: "searchConsoleGroups", kind: "bars", by: "query", measure: "clicks" });
    expect(built.chart.groups[0]).toEqual({ name: "cupboard handles", value: 420, before: 380 });
  });

  test("a scatter sets times shown against the share clicked, for searches shown enough to judge", () => {
    const built = searchGroupsChartFrom(searches, { ...ask, kind: "scatter", measure: "clicks" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart.measure).toBe("impressions");
    expect(built.chart.groups.find((group) => group.name === "door handles")).toEqual({ name: "door handles", value: 2.5, visits: 12_000 });
    expect(built.chart.groups.map((group) => group.name)).not.toContain("hinges");
  });

  test("a pie shares out the clicks, and Search Console has no grid", () => {
    const built = searchGroupsChartFrom(searches, { ...ask, kind: "pie", measure: "clicks" });
    if (!built.ok) throw new Error(built.problem);
    expect(Math.round(built.chart.groups.reduce((sum, group) => sum + group.value, 0))).toBe(100);
    expect(searchGroupsChartFrom(searches, { ...ask, kind: "grid", measure: "clicks" })).toMatchObject({ ok: false, problem: expect.stringContaining("no grid") });
  });

  test("the week's hours as a grid: Monday first, four hours a square, the times added up", () => {
    // Sunday (Google's 0) quiet; Monday busy at 9 and 10am; every other day one at noon.
    const cells = Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => (day === 1 && (hour === 9 || hour === 10) ? 5 : day > 1 && hour === 12 ? 1 : 0)));
    const built = hoursGridFrom(cells, { event: "purchase", website: "morehandles.co.uk", period: "lastMonth", link: "/app/analytics/site/events/event?key=purchase" });
    if (!built.ok) throw new Error(built.problem);
    expect(built.chart).toMatchObject({ kind: "grid", by: "hour", event: "purchase" });
    expect(built.chart.groups.map((group) => group.name)).toEqual(["00:00–04:00", "04:00–08:00", "08:00–12:00", "12:00–16:00", "16:00–20:00", "20:00–00:00"]);
    expect(built.chart.rows?.map((row) => row.event)).toEqual(["1", "2", "3", "4", "5", "6", "0"]);
    expect(built.chart.rows?.[0].values).toEqual([0, 0, 10, 0, 0, 0]);
    expect(built.chart.groups[3].value).toBe(5);
    expect(hoursGridFrom(Array.from({ length: 7 }, () => Array(24).fill(0)), { event: "purchase", website: "x", period: "lastMonth", link: "/" }).ok).toBe(false);
  });
});
