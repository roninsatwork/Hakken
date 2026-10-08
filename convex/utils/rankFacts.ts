import { packNumbers, unpackNumbers } from "./searchConsolePacks";

/**
 * A ranking row's two largest facts about its search, packed
 * (core-data-normalisation-plan.md, part 2, 2026-10-08): its twelve months of
 * searches (`trend`, 3.7 MB of dev's 28.5 MB of rankings as lists of numbers,
 * nine bytes each) and what else its results page shows (`serpFeatures`, 2.5
 * MB as lists of names). Measured before part 2's "keywords once": only 22%
 * of the searches the rankings name are shared by two websites, so holding
 * these once a search saved about a megabyte; packed on the row, five.
 *
 * Both are read back as they always were — numbers, oldest month first, and
 * DataForSEO's names — so nothing on screen changes. A row kept before is read
 * as it is.
 */

/** A search's months of searches as stored: packed (`packNumbers`), or a list as kept before 2026-10-08. */
export type StoredTrend = string | number[];

export function packTrend(trend: readonly number[]): string {
  return packNumbers(trend);
}

export function trendOf(stored: StoredTrend | undefined): number[] {
  return stored === undefined ? [] : unpackNumbers(stored);
}

/**
 * The kinds of result DataForSEO names on a results page (`serp_info.serp_item_types`),
 * each stored as its place here. Only ever added to, at the end: a place once
 * given is on every row naming it. A name not here keeps its row's list as names.
 */
export const SERP_FEATURES = [
  "organic", "paid", "featured_snippet", "people_also_ask", "related_searches", "people_also_search", "images", "video",
  "short_videos", "local_pack", "map", "knowledge_graph", "top_stories", "shopping", "popular_products", "ai_overview",
  "google_reviews", "third_party_reviews", "compare_sites", "discussions_and_forums", "find_results_on", "scholarly_articles",
  "jobs", "google_hotels", "hotels_pack", "google_flights", "carousel", "multi_carousel", "product_considerations", "recipes",
  "perspectives", "top_sights", "answer_box", "twitter", "events", "app", "google_posts", "mention_carousel", "podcasts",
  "questions_and_answers", "stocks_box", "visual_stories", "commercial_units", "local_services", "math_solver",
  "currency_box", "found_on_web", "refine_products", "explore_brands", "courses",
] as const;

const FEATURE_PLACE = new Map<string, number>(SERP_FEATURES.map((name, place) => [name, place]));

/** A results page's features as stored: their places packed, or names when one is not known here. */
export type StoredFeatures = string | string[];

export function packFeatures(features: readonly string[]): StoredFeatures {
  const places = features.map((name) => FEATURE_PLACE.get(name));
  return places.every((place) => place !== undefined) ? packNumbers(places as number[]) : [...features];
}

export function featuresOf(stored: StoredFeatures | undefined): string[] {
  if (stored === undefined) return [];
  if (typeof stored !== "string") return stored;
  return unpackNumbers(stored).map((place) => SERP_FEATURES[place] ?? "");
}
