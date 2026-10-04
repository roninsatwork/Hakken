import { describe, expect, test } from "vitest";
import { hostOf, overviewTask, readGoogleResults, readKeywordOverviews, readSearchHistories, serpTask } from "./keywordResearchCalls";
import { searchPlaceOf } from "./utils/researchCountries";

/** DataForSEO's answers as they arrive, cut to the fields read (shapes from their docs and the sandbox). */
const OVERVIEW = [{
  items: [{
    keyword: "web design agency",
    keyword_info: {
      search_volume: 3600, cpc: 6.2, competition_level: "HIGH",
      monthly_searches: [{ year: 2026, month: 9, search_volume: 4400 }, { year: 2026, month: 8, search_volume: 2900 }],
    },
    keyword_properties: { keyword_difficulty: 64 },
    serp_info: { serp_item_types: ["organic", "local_pack", "people_also_ask"], se_results_count: 1_200_000 },
    avg_backlinks_info: { referring_domains: 180.4, main_domain_rank: 386.4 },
    search_intent_info: { main_intent: "commercial" },
  }, { keyword: "Odd Keyword" }],
}];

describe("Keyword research's calls", () => {
  test("ask for English, in the country chosen, deep enough to say 'not in the top 100'", () => {
    expect(overviewTask(["web design agency"], 2826)).toEqual({ keywords: ["web design agency"], location_code: 2826, language_code: "en", include_serp_info: true });
    expect(serpTask("web design agency", 2840)).toEqual({ keyword: "web design agency", location_code: 2840, language_code: "en", depth: 100 });
  });

  test("ask Google from the city a keyword names, else the whole country", () => {
    expect(searchPlaceOf("app developer london", 2826)).toBe(1006886);
    expect(searchPlaceOf("Web Design, Newcastle", 2826)).toBe(1007220);
    expect(searchPlaceOf("london or manchester agencies", 2826)).toBe(1006886);
    expect(searchPlaceOf("web designers surrey", 2826)).toBe(2826);
    expect(searchPlaceOf("londoner app", 2826)).toBe(2826);
    // A city is asked from only in its own country.
    expect(searchPlaceOf("app developer london", 2840)).toBe(2840);
  });

  test("read a keyword's overview, missing figures as null", () => {
    const read = readKeywordOverviews(OVERVIEW);
    expect(read.get("web design agency")).toEqual({
      searchVolume: 3600, cpc: 6.2, competitionLevel: "HIGH", difficulty: 64, intent: "commercial",
      monthly: [{ month: "2026-08", volume: 2900 }, { month: "2026-09", volume: 4400 }],
      serpKinds: ["local_pack", "people_also_ask"], resultsCount: 1_200_000, topTenLinkingSites: 180.4,
      topTenDomainStrength: 39,
    });
    expect(read.get("odd keyword")).toMatchObject({ searchVolume: null, difficulty: null, monthly: [], serpKinds: [] });
  });

  test("keep the last 24 months of a keyword's history, oldest first", () => {
    const months = Array.from({ length: 30 }, (_, index) => ({ year: 2024 + Math.floor((index + 3) / 12), month: ((index + 3) % 12) + 1, search_volume: index }));
    const read = readSearchHistories([{ items: [{ keyword: "seo", keyword_info: { monthly_searches: months } }] }]).get("seo")!;
    expect(read).toHaveLength(24);
    expect(read[0].month < read[23].month).toBe(true);
    expect(read[23]).toEqual({ month: "2026-09", volume: 29 });
  });

  test("read Google's ordinary results in order, leaving out adverts and boxes", () => {
    const read = readGoogleResults([{ items: [
      { type: "paid", rank_group: 1, url: "https://ads.test/" },
      { type: "organic", rank_group: 2, url: "https://www.b.test/two", domain: "www.b.test", title: "Two" },
      { type: "organic", rank_group: 1, url: "https://a.test/one", domain: "a.test", title: "One" },
      { type: "local_pack", rank_group: 1, url: "https://map.test/" },
    ] }]);
    expect(read).toEqual([
      { position: 1, url: "https://a.test/one", domain: "a.test", title: "One" },
      { position: 2, url: "https://www.b.test/two", domain: "b.test", title: "Two" },
    ]);
  });

  test("compare hosts without www or case", () => {
    expect(hostOf("https://WWW.Ronins.co.uk/web/")).toBe("ronins.co.uk");
    expect(hostOf("ronins.co.uk")).toBe("ronins.co.uk");
  });
});
