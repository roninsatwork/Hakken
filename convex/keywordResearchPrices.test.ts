import { describe, expect, test } from "vitest";
import { researchCosts } from "./keywordResearchPrices";

/** What each part of a lookup costs, from DataForSEO's published prices (checked 2026-10-04) and the company's limits. */
describe("Keyword research's costs", () => {
  test("at the starting limits, about 48 cents a keyword opened on every screen", () => {
    const costs = researchCosts({ researchIdeasPerKind: 100, researchOverviewSearches: 25 });
    // Look up 1.2 + 1.2 + 1.55 + 1.3; results 2.4 + 2.4 + 10 × 1.3; ideas 2 × 2.4; the AI 7.4 + 12.5; a country 1.2.
    expect(costs).toEqual({ lookUp: 5, results: 18, ideas: 5, answers: 20, country: 1 });
    expect(costs.lookUp + costs.results + costs.ideas + costs.answers).toBe(48);
  });

  test("follow the company's limits", () => {
    expect(researchCosts({ researchIdeasPerKind: 1_000, researchOverviewSearches: 100 })).toMatchObject({ results: 29, ideas: 26, answers: 27 });
    // No AI Overview searches: the four assistants alone.
    expect(researchCosts({ researchIdeasPerKind: 100, researchOverviewSearches: 0 }).answers).toBe(7);
  });
});
