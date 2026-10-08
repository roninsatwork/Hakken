import { describe, expect, test } from "vitest";
import { SERP_FEATURES, featuresOf, packFeatures, packTrend, trendOf } from "./rankFacts";

/** A ranking row's months of searches and results-page features, packed on the row (core-data plan, part 2). */
describe("a ranking row's search facts, packed", () => {
  test("twelve months of searches read back as they were, oldest first; a list kept before reads as it is", () => {
    const trend = [0, 10, 260, 1_900, 12_100, 0, 5, 33_100, 8, 90, 480, 1];
    const packed = packTrend(trend);
    expect(typeof packed).toBe("string");
    expect(packed.length).toBeLessThan(40);
    expect(trendOf(packed)).toEqual(trend);
    expect(trendOf(trend)).toEqual(trend);
    expect(trendOf(undefined)).toEqual([]);
  });

  test("a results page's features read back as DataForSEO named them; one not known keeps the row's list as names", () => {
    const features = ["related_searches", "people_also_ask", "images", "ai_overview", "events"];
    const packed = packFeatures(features);
    expect(typeof packed).toBe("string");
    expect(featuresOf(packed)).toEqual(features);
    expect(packFeatures(["images", "brand_new_kind"])).toEqual(["images", "brand_new_kind"]);
    expect(featuresOf(["images", "brand_new_kind"])).toEqual(["images", "brand_new_kind"]);
    expect(featuresOf(undefined)).toEqual([]);
  });

  test("the known features are each named once, so a place means one name for ever", () => {
    expect(new Set(SERP_FEATURES).size).toBe(SERP_FEATURES.length);
  });
});
