import { describe, expect, test } from "vitest";
import { MOST_PAGE_DATA_CHARS, pageDataFor, pageFacts, pageFigureLines, trimPageData } from "./pageData";
import { seesScreenFor, seesWrites } from "./screens";

/**
 * A page's own figures for the eye, and the list of every page's eye (sees-every-page-plan-2026-10-31.md, phase 1).
 */
describe("a page's own figures", () => {
  test("cut to what the page shows first: plumbing dropped, a fraction rate shown as its percentage, lists to their first rows", () => {
    const rows = Array.from({ length: 40 }, (_, at) => ({ _id: `r${at}`, key: `search ${at}`, clicks: 40 - at, ctr: 0.05, href: "/x", changePercent: 12 }));
    const trimmed = trimPageData({ siteId: "s1", rows, total: { clicks: 900, conversionRate: 0.034, rate: 3.4 } }) as { rows: Array<Record<string, unknown>>; total: Record<string, unknown> };
    expect(trimmed.rows).toHaveLength(25);
    expect(trimmed.rows[0]).toEqual({ key: "search 0", clicks: 40, ctrPercent: 5, changePercent: 12 });
    // A rate already a percentage (3.4) is left as it is.
    expect(trimmed.total).toEqual({ clicks: 900, conversionRatePercent: 3.4, rate: 3.4 });
    expect(trimmed).not.toHaveProperty("siteId");
  });

  test("on Google Analytics' screens a rate, share or change past 1 is a percentage past 100; elsewhere a figure past 1 is left as it is", () => {
    // A channel's conversions over its visits, and a campaign's visits against the span before (page-screen-redo-plan-2026-11-03.md).
    const channels = { rows: [{ name: "Paid Search", conversionRate: 1.827, change: 2, share: 0.4 }] };
    expect(pageDataFor(channels, "googleAnalytics.channelsPage")).toEqual({ rows: [{ name: "Paid Search", conversionRatePercent: 182.7, changePercent: 200, sharePercent: 40 }] });
    // Insights' page plan keeps its rates as percentages; Search Console's moves count places.
    expect(pageDataFor({ rows: [{ page: "/a", rate: 3.4 }] }, "insights.pagePlan")).toEqual({ rows: [{ page: "/a", rate: 3.4 }] });
    expect(pageDataFor({ rows: [{ key: "door handles", change: 16 }] }, "searchConsole.almost")).toEqual({ rows: [{ key: "door handles", change: 16 }] });
    // Read twice, as the eye and then the press read it, it stays as it was read once.
    const once = pageDataFor(channels, "googleAnalytics.channelsPage");
    expect(pageDataFor(once, "googleAnalytics.channelsPage")).toEqual(once);
  });

  test("held to its size: the longest lists cut until it fits", () => {
    const huge = { rows: Array.from({ length: 25 }, (_, at) => ({ key: `page ${at}`, words: "x".repeat(199), more: Array.from({ length: 25 }, () => ({ note: "y".repeat(199) })) })) };
    expect(JSON.stringify(huge).length).toBeGreaterThan(MOST_PAGE_DATA_CHARS);
    expect(JSON.stringify(pageDataFor(huge)).length).toBeLessThanOrEqual(MOST_PAGE_DATA_CHARS);
  });

  test("keyed for the writer and lined up for the chat, each by its row's name", () => {
    const data = { rows: [{ key: "door handles", clicks: 840, ctrPercent: 7 }] };
    const { facts } = pageFacts("searchConsole.keywords", data);
    expect(facts.map((fact) => [fact.key, fact.value, fact.unit, fact.source])).toEqual([
      ["page.rows.door_handles.clicks", 840, "count", "searchConsole"],
      ["page.rows.door_handles.ctrPercent", 7, "percent", "searchConsole"],
    ]);
    expect(pageFigureLines("searchConsole.keywords", data)).toEqual(["rows · door_handles · clicks: 840", "rows · door_handles · ctrPercent: 7%"]);
    expect(pageFacts("nowhere.page", data).facts).toEqual([]);
  });
});

describe("every page's eye, described once", () => {
  test("a page's own entry, its family's, or its section's defaults", () => {
    expect(seesScreenFor("googleAnalytics.event:purchase")).toMatchObject({ section: "googleAnalytics", writer: "INSIGHTS_CONVERSION", about: "one conversion's own screen" });
    expect(seesScreenFor("clarity.errors")).toMatchObject({ writer: "INSIGHTS_BEHAVIOUR", writes: true });
    expect(seesScreenFor("bing.somethingNew")).toMatchObject({ writer: "INSIGHTS_SEARCH", about: "the something new page of Bing Webmaster" });
    expect(seesScreenFor("elsewhere.page")).toBeNull();
  });

  test("Insights' weekly boxes write nothing new; every other page writes", () => {
    expect(seesWrites("insights.strategy")).toBe(false);
    expect(seesWrites("insights.cannibalisation")).toBe(true);
    expect(seesWrites("visibility.backlinksDomains")).toBe(true);
    expect(seesWrites("elsewhere.page")).toBe(false);
  });
});
