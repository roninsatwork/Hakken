import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import en from "@/messages/en.json";
import { MOST_PAGE_DATA_CHARS, briefOf, findingNames, findingsBriefOf, usesCodeFirstBrief, pageDataFor, pageFacts, pageFigureLines, trimPageData } from "./pageData";
import { servicesEyeData } from "./analyticsServices";
import { pageFindings } from "./pageFindings";
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
    expect(trimmed).toHaveProperty("rowsAllRows", 40);
    // A rate already a percentage (3.4) is left as it is.
    expect(trimmed.total).toEqual({ clicks: 900, conversionRatePercent: 3.4, rate: 3.4 });
    expect(trimmed).not.toHaveProperty("siteId");
  });

  test("on Google Analytics' screens a rate, share or change past 1 is a percentage past 100; elsewhere a figure past 1 is left as it is", () => {
    // A channel's conversions over its visits, and a campaign's visits against the span before (page-screen-redo-plan-2026-11-03.md).
    const channels = { rows: [{ name: "Paid Search", conversionRate: 1.827, change: 2, share: 0.4 }] };
    expect(pageDataFor(channels, "googleAnalytics.channelsPage")).toEqual({ rows: [{ name: "Paid Search", conversionRatePercent: 182.7, changePercent: 200, sharePercent: 40 }] });
    // Insights keeps every rate as a percentage, under 1 as well (0.8%); Search Console's moves count places.
    expect(pageDataFor({ rows: [{ page: "/a", rate: 3.4 }] }, "insights.pagePlan")).toEqual({ rows: [{ page: "/a", rate: 3.4 }] });
    expect(pageDataFor({ rows: [{ page: "/a", rate: 0.8, share: 0.5 }] }, "insights.enquiries")).toEqual({ rows: [{ page: "/a", rate: 0.8, share: 0.5 }] });
    expect(pageDataFor({ rows: [{ key: "door handles", change: 16 }] }, "searchConsole.almost")).toEqual({ rows: [{ key: "door handles", change: 16 }] });
    // Read twice, as the eye and then the press read it, it stays as it was read once.
    const once = pageDataFor(channels, "googleAnalytics.channelsPage");
    expect(pageDataFor(once, "googleAnalytics.channelsPage")).toEqual(once);
  });

  test("a dated list keeps its newest rows, as many as a year of days, whichever way it runs (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 1)", () => {
    const day = (at: number) => new Date(Date.UTC(2026, 0, 1) + at * 86_400_000).toISOString().slice(0, 10);
    // A 90-day chart, oldest first as charts run: all 90 kept, where once only its oldest 25 were.
    const chart = { points: Array.from({ length: 90 }, (_, at) => ({ day: day(at), clicks: at })) };
    const kept = trimPageData(chart) as { points: Array<{ day: string }> };
    expect(kept.points).toHaveLength(90);
    expect(kept.points.at(-1)?.day).toBe(day(89));
    // Longer than a year of days: the newest 400, oldest first or newest first.
    const long = Array.from({ length: 500 }, (_, at) => ({ day: day(at), clicks: at }));
    expect((trimPageData({ points: long }) as { points: Array<{ day: string }> }).points.map((point) => point.day)).toEqual(long.slice(100).map((point) => point.day));
    expect((trimPageData({ points: [...long].reverse() }) as { points: Array<{ day: string }> }).points[0].day).toBe(day(499));
    // Weeks and months are dated too; a list named by anything else keeps its first rows, as the page opens.
    expect((trimPageData({ weeks: Array.from({ length: 30 }, (_, at) => ({ week: `2026-W${String(at + 1).padStart(2, "0")}`, clicks: at })) }) as { weeks: unknown[] }).weeks).toHaveLength(30);
    // And the writer's short brief is of the newest days, not the oldest.
    expect((briefOf(chart, 8) as { points: Array<{ day: string }> }).points.map((point) => point.day)).toEqual(chart.points.slice(82).map((point) => point.day));
  });

  test("a list cut to its first rows says how long it was (shared work 4)", () => {
    const rows = Array.from({ length: 9000 }, (_, at) => ({ key: `page ${at}`, views: 9000 - at }));
    const trimmed = trimPageData({ rows }) as { rows: unknown[]; rowsAllRows: number };
    expect(trimmed.rows).toHaveLength(25);
    expect(trimmed.rowsAllRows).toBe(9000);
    // Read again, it stays as it was.
    expect(trimPageData(trimmed)).toEqual(trimmed);
  });

  test("outside Google Analytics a change counts places or clicks, never a percentage (shared work 2)", () => {
    // Visibility: a search 0.4 places higher, once read as 40%; Search Console: one click gained, once read as 100%.
    expect(pageDataFor({ rows: [{ keyword: "door handles", position: 4, change: 0.4 }] }, "visibility.keywords")).toEqual({ rows: [{ keyword: "door handles", position: 4, change: 0.4 }] });
    expect(pageDataFor({ rows: [{ key: "door handles", clicks: 3, change: 1, positionChange: -0.6 }] }, "searchConsole.keywords")).toEqual({ rows: [{ key: "door handles", clicks: 3, change: 1, positionChange: -0.6 }] });
    // A rate or share is still a fraction everywhere; Google Analytics' changes are fractions too.
    expect(pageDataFor({ rows: [{ key: "door handles", ctr: 0.05 }] }, "searchConsole.keywords")).toEqual({ rows: [{ key: "door handles", ctrPercent: 5 }] });
    expect(pageDataFor({ rows: [{ name: "Referral", visits: 640, change: 0.64 }] }, "googleAnalytics.channelsPage")).toEqual({ rows: [{ name: "Referral", visits: 640, changePercent: 64 }] });
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

  // The pages that already show Hakken's advice write a piece about that page only, building on the advice handed with
  // their figures (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 2; Anthony, 2026-11-03: "we make ask hakken
  // look at every page and make it targeted towards the page it is on", then "replace whatever has gone before as it's
  // clearly broken"). Before, their eye repeated the advice on the page as its own words.
  test("Insights' pages that show Hakken's advice write, building on it", () => {
    for (const key of ["insights.finding", "insights.report", "insights.yourMonth", "insights.thisWeek", "insights.findings"]) {
      expect(seesWrites(key), key).toBe(true);
      expect(seesScreenFor(key)?.parts?.[0], key).toMatch(/^the advice already on the page/);
    }
  });
});

describe("the code-first brief (eye-code-first-brief-plan-2026-11-07.md)", () => {
  const row = (name: string, visits: number) => ({ name, visits: `${visits} [[page.rows.${name}.visits]]` });
  const step = (month: string, visits: number) => ({ month, visits: `${visits} [[page.steps.${month}.visits]]` });

  test("every row a finding names, and the first few of each list for the setting", () => {
    const shown = { rows: [row("A", 90), row("B", 80), row("C", 70), row("D", 60), row("E", 50)], total: "350 [[page.total]]" };
    const brief = findingsBriefOf(shown, new Set(["e"]), 2) as { rows: Array<{ name: string }>; total: string };
    expect(brief.rows.map((one) => one.name)).toEqual(["A", "B", "E"]);
    expect(brief.total).toBe("350 [[page.total]]");
  });

  test("a dated list keeps its newest steps and its busiest, so a peak can still be said", () => {
    const shown = { steps: [step("2026-01", 10), step("2026-02", 90), step("2026-03", 20), step("2026-04", 30), step("2026-05", 15)] };
    const brief = findingsBriefOf(shown, new Set(), 2) as { steps: Array<{ month: string }> };
    expect(brief.steps.map((one) => one.month)).toEqual(["2026-02", "2026-04", "2026-05"]);
  });

  test("a finding's own name and the one it's set beside, several joined by commas each counted", () => {
    expect([...findingNames([{ params: { name: "AI Agency, Venture Studio", other: "The whole website" } }, { params: { name: 12 } }])]).toEqual(["ai agency", "venture studio", "the whole website"]);
  });

  test("on Ronins' Services, a fraction of the page's words, with every row its findings name", () => {
    const data = pageDataFor(servicesEyeData(readFixture("roninsServices").last12Months, en.googleAnalytics.eyeNames as Record<string, string>), "googleAnalytics.services");
    const read = pageFacts("googleAnalytics.services", data, {});
    const findings = pageFindings("googleAnalytics.services", data);
    expectEyeHolds("googleAnalytics.services", data);
    const brief = findingsBriefOf(read.shown, findingNames(findings), 3);
    // Well under the short brief every page has had, before the parts its charts add, which shrink further.
    expect(JSON.stringify(brief).length).toBeLessThan(JSON.stringify(briefOf(read.shown, 8)).length * 0.65);
    expect(brief).toHaveProperty("names");
    const kept = ((brief as { services: Array<{ name: string }> }).services).map((one) => one.name);
    for (const name of ["AI Agency", "ChatBot Agency"]) expect(kept).toContain(name);
  });
});

describe("which pages are on the code-first brief", () => {
  test("a page listed on its own, or every page of a section listed", () => {
    expect(usesCodeFirstBrief("googleAnalytics.services")).toBe(true);
    expect(usesCodeFirstBrief("googleAnalytics.overview")).toBe(true);
    expect(usesCodeFirstBrief("clarity.pages")).toBe(true);
    expect(usesCodeFirstBrief("visibility.competitors")).toBe(true);
    expect(usesCodeFirstBrief("searchConsole.performance")).toBe(true);
    expect(usesCodeFirstBrief("insights.thisWeek")).toBe(true);
    expect(usesCodeFirstBrief("bing.performance")).toBe(true);
    expect(usesCodeFirstBrief("nowhere.atAll")).toBe(false);
  });
});
