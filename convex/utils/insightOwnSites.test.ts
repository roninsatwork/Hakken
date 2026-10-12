import { describe, expect, test } from "vitest";
import { candidatesFor } from "./insightChecks";
import { sharedSearchFacts, sharedSearches, type RankedRow } from "./insightOwnSites";

/**
 * A company's own websites competing for one search (insights-analyst-plan.md
 * I4). Ronins has one website, so this is proved here rather than on its data.
 */

const row = (keyword: string, position: number, volume: number | null, page = "/"): RankedRow => ({ keyword, position, page, volume });

describe("searches a company's own websites share", () => {
  test("only both in the top 20, against the best-placed of the others, the most searched first", () => {
    const shared = sharedSearches(
      [row("web design london", 6, 1900, "/web-design/"), row("seo agency", 14, 2400, "/seo/"), row("app developers", 3, 880), row("brand agency", 25, 5000)],
      [
        { host: "acme-studio.test", rows: [row("web design london", 9, 1900, "/services/"), row("seo agency", 18, 2400), row("brand agency", 4, 5000)] },
        { host: "acme-digital.test", rows: [row("seo agency", 11, 2400, "/seo-services/"), row("app developers", 31, 880)] },
      ],
    );
    expect(shared).toEqual([
      { keyword: "seo agency", volume: 2400, position: 14, page: "/seo/", otherHost: "acme-digital.test", otherPosition: 11, otherPage: "/seo-services/" },
      { keyword: "web design london", volume: 1900, position: 6, page: "/web-design/", otherHost: "acme-studio.test", otherPosition: 9, otherPage: "/services/" },
    ]);
  });

  test("nothing for a company with one website, or none shared", () => {
    expect(sharedSearches([row("seo agency", 4, 2400)], [])).toEqual([]);
    expect(sharedSearchFacts("acme.test", [], "2026-10-12")).toEqual([]);
  });

  test("three or more shared make a candidate for the Search specialist, fewer is chance", () => {
    const shared = sharedSearches(
      [row("a", 5, 300), row("b", 8, 200), row("c", 12, 100)],
      [{ host: "acme-studio.test", rows: [row("a", 7, 300), row("b", 3, 200), row("c", 15, 100)] }],
    );
    const facts = sharedSearchFacts("acme.test", shared, "2026-10-12");
    expect(facts.find((fact) => fact.key === "own.shared.count")?.value).toBe(3);
    expect(facts.find((fact) => fact.key === "own.shared.top.position")?.label).toContain(`"a"`);
    expect(candidatesFor(facts, "acme.test").map((candidate) => candidate.pattern)).toContain("ownSitesCompete");
    expect(candidatesFor(sharedSearchFacts("acme.test", shared.slice(0, 2), "2026-10-12"), "acme.test").map((candidate) => candidate.pattern)).not.toContain("ownSitesCompete");
  });
});
