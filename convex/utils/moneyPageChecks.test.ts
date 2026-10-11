import { describe, expect, test } from "vitest";
import { candidatesFor } from "./insightChecks";
import type { Fact } from "./insightFacts";
import { fastEnough, indexedFrom, missingStructuredData, slowestPart, speedFrom, structuredDataOf } from "./moneyPageChecks";

/**
 * The money pages' weekly checks (insights-analyst-plan.md §4.4, phase 8):
 * Google's URL inspection and PageSpeed answers read as kept, a page's
 * structured data read from its markup, and the Technical SEO specialist's
 * checklist on the figures they give.
 */

describe("reading Google's answers", () => {
  test("URL inspection: indexed or not, when Google last read the page, and another page chosen in its place", () => {
    const answer = { inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed", lastCrawlTime: "2026-07-19T04:12:00Z", pageFetchState: "SUCCESSFUL", googleCanonical: "https://www.ronins.co.uk/ux-design-agency/", userCanonical: "https://www.ronins.co.uk/ux-design-agency/" } } };
    expect(indexedFrom(answer, "https://www.ronins.co.uk/ux-design-agency/")).toEqual({ verdict: "PASS", coverage: "Submitted and indexed", lastRead: "2026-07-19", fetch: "SUCCESSFUL", otherCanonical: false });
    const moved = { inspectionResult: { indexStatusResult: { verdict: "NEUTRAL", coverageState: "Duplicate, Google chose different canonical than user", googleCanonical: "https://www.ronins.co.uk/a/", userCanonical: "https://www.ronins.co.uk/b/" } } };
    expect(indexedFrom(moved, "https://www.ronins.co.uk/b/")?.otherCanonical).toBe(true);
    expect(indexedFrom({}, "x")).toBeNull();
  });

  test("PageSpeed: the page's own real-visitor figures, else the website's", () => {
    const page = { loadingExperience: { id: "https://www.ronins.co.uk/", overall_category: "AVERAGE", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3400 }, INTERACTION_TO_NEXT_PAINT: { percentile: 180 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 2 } } } };
    expect(speedFrom(page)).toEqual({ lcpMs: 3400, inpMs: 180, cls: 0.02, category: "AVERAGE", scope: "PAGE" });
    const origin = { loadingExperience: { id: "origin:https://www.ronins.co.uk", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000 } } }, originLoadingExperience: { overall_category: "FAST", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000 } } } };
    expect(speedFrom(origin)).toMatchObject({ lcpMs: 2000, scope: "WEBSITE" });
    expect(speedFrom({})).toBeNull();
  });

  test("fast enough on all three of Google's measures, and the worst part named", () => {
    const slow = { lcpMs: 3400, inpMs: 180, cls: 0.02, category: "AVERAGE", scope: "PAGE" as const };
    expect(fastEnough(slow)).toBe(false);
    expect(slowestPart(slow)).toBe("MAIN_CONTENT");
    expect(fastEnough({ ...slow, lcpMs: 2100 })).toBe(true);
    expect(slowestPart({ ...slow, lcpMs: 2100, cls: 0.12 })).toBe("SHIFTS");
    expect(fastEnough(null)).toBeNull();
  });
});

describe("a page's structured data", () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Ronins"},{"@type":["WebPage"],"breadcrumb":{"@type":"BreadcrumbList"}}]}</script>
    <script type='application/ld+json'>{ broken </script>
  </head><body><div itemscope itemtype="https://schema.org/Review"></div></body></html>`;

  test("JSON-LD types, nested and in a graph, and microdata, each once; a broken block skipped", () => {
    expect(structuredDataOf(html)).toEqual(["BreadcrumbList", "Organization", "Review", "WebPage"]);
  });

  test("what a page's kind should carry: company facts on the home page, the service on a service page", () => {
    expect(missingStructuredData("HOME", ["Organization"])).toEqual([]);
    expect(missingStructuredData("HOME", ["WebSite"])).toEqual(["ORGANISATION"]);
    expect(missingStructuredData("SERVICE", ["ProfessionalService", "FAQPage"])).toEqual(["SERVICE"]);
    expect(missingStructuredData("SERVICE", ["Service"])).toEqual([]);
    expect(missingStructuredData("ARTICLE", [])).toEqual([]);
  });
});

describe("the Technical SEO specialist's checklist", () => {
  const count = (key: string, value: number, label = key): Fact => ({ key, value, unit: "count", source: "searchConsole", label });

  test("a money page not indexed, one Google hasn't read in months, slow pages, missing markup and pages nothing links to", () => {
    const candidates = candidatesFor([
      count("tech.inspected", 12), count("tech.indexed", 11), count("tech.page./blockchain-developers/.notIndexed", 1, "/blockchain-developers/ not indexed by Google"),
      count("tech.page./ux-design-agency/.unreadDays", 84, "days since Google last read /ux-design-agency/"),
      count("tech.timed", 6), count("tech.fast", 4), { key: "tech.page./.mainContent", value: 3.4, unit: "seconds", source: "crawl", label: "seconds before / shows its main content to real visitors on phones" },
      count("tech.marked", 12), count("tech.missingMarkup", 3),
      count("crawl.pages", 175), count("crawl.orphans", 4),
    ], "ronins.co.uk").filter((candidate) => candidate.specialist === "technical");
    // Ordered by what is at stake: the page Google won't show first.
    expect(candidates.map((candidate) => candidate.pattern)).toEqual(["moneyPageNotIndexed", "slowMoneyPages", "missingMarkup", "moneyPageUnread", "orphanPages"]);
    const of = (pattern: string) => candidates.find((candidate) => candidate.pattern === pattern)!;
    expect(of("moneyPageUnread").seen).toContain("/ux-design-agency/ [[tech.page./ux-design-agency/.unreadDays]] days ago");
    expect(of("slowMoneyPages").seen).toContain("/ takes [[tech.page./.mainContent]] seconds");
  });
});
