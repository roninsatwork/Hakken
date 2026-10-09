import type { SeoOperation } from "./dataForSeoRegistry";
import { DEFAULT_LOCATION_CODE, countryCodeOf } from "./utils/seoLocations";

/**
 * What Discovery's Local pages buy (docs/plans/active/discovery-local-reputation-ai-plan.md,
 * §6): a business's Google profile, where it sits on Google Maps, the
 * businesses of its kind near it, its posts, and finding a business by name.
 *
 * Every path and body here was tried with one paid call on 2026-10-09 (plan
 * §6A, 17 calls, $0.35 in all), and each price below is the one that call was
 * charged:
 *
 * - **Business listings search** (live): about $0.012 a request and $0.0004
 *   a business — $0.0127 for two, $0.0192 for twenty. Lists the businesses of
 *   one category round a map point (`categories`, `location_coordinate`
 *   "lat,lng,km"), each with its whole profile as the supplier last read it.
 *   Not used to find a business by name: its `title` must be the business's
 *   own, so "Ronins Guildford" found nothing (tried 2026-10-09).
 * - **Finding a business by name and town** is a search on Google Maps
 *   across the United Kingdom, as a person would type it: "Ronins Guildford"
 *   found exactly Ronins, for $0.002 (tried 2026-10-09).
 * - **My Business Info** (live): one profile read now, $0.0054, by Google's
 *   place number (`keyword: "cid:…"`).
 * - **Google Maps** (live, SERP): one search at one map point, 20 deep, $0.002;
 *   each business with Google's own reason for showing it.
 * - **My Business Updates** (queued): a profile's posts, $0.00225 for ten.
 * - **Trustpilot search** (queued): $0.00075 a search; it returns look-alikes
 *   as readily as the business, so a page is linked only when a person says
 *   "This is us" (plan D3).
 * - **Tripadvisor search** (queued, tried on D14's calls): $0.00075 a search,
 *   each page with its path, rating and reviews.
 * - **Questions and Answers** (queued, D14): $0.00075 for twenty, those
 *   answered and those not. Ronins had none; IKEA Wembley had thirty, the
 *   newest years old — Google dates them only "4 years ago".
 */

export const LISTING_FIND_OPERATION = "google_maps_find";
export const LOCAL_MARKET_OPERATION = "local_market";
export const BUSINESS_PROFILE_OPERATION = "google_business_profile";
export const MAP_CHECK_OPERATION = "google_maps_check";
export const BUSINESS_POSTS_OPERATION = "google_business_posts";
export const TRUSTPILOT_FIND_OPERATION = "trustpilot_find";
export const TRIPADVISOR_FIND_OPERATION = "tripadvisor_find";
export const BUSINESS_QUESTIONS_OPERATION = "google_business_questions";

export const LOCAL_OPERATION_IDS: ReadonlySet<string> = new Set([
  LISTING_FIND_OPERATION, LOCAL_MARKET_OPERATION, BUSINESS_PROFILE_OPERATION,
  MAP_CHECK_OPERATION, BUSINESS_POSTS_OPERATION, TRUSTPILOT_FIND_OPERATION, TRIPADVISOR_FIND_OPERATION,
  BUSINESS_QUESTIONS_OPERATION,
]);

export function isLocalOperation(operationId: string): boolean {
  return LOCAL_OPERATION_IDS.has(operationId);
}

/**
 * Where "No Search Results" (40102) is an answer, not a failure: a profile
 * with no posts or no questions, a name not on Trustpilot or Tripadvisor.
 * Ronins' profiles answered so on their first run (2026-10-09): filed as an
 * empty list, so the page says "none" rather than the run reporting a fault.
 */
const EMPTY_IS_AN_ANSWER: ReadonlySet<string> = new Set([
  BUSINESS_POSTS_OPERATION, BUSINESS_QUESTIONS_OPERATION, TRUSTPILOT_FIND_OPERATION, TRIPADVISOR_FIND_OPERATION,
]);

export function emptyIsAnAnswer(operationId: string): boolean {
  return EMPTY_IS_AN_ANSWER.has(operationId);
}

/** How near Google Maps is looked from an office: a town's streets. */
const MAP_ZOOM = "14z";

/** How often a watched profile is read again, and its posts. */
export const PROFILE_REFRESH_DAYS = 7;
/** How often an office's local market is listed again. */
export const MARKET_REFRESH_DAYS = 30;

export const LOCAL_OPERATIONS: readonly SeoOperation[] = [
  {
    id: LISTING_FIND_OPERATION,
    question: "Which businesses does Google Maps show for this business name and town, in the United Kingdom?",
    family: "SERP",
    mode: "LIVE",
    path: "/v3/serp/google/maps/live/advanced",
    costBand: "low",
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "The business's name and town as a person would type them: 'Ronins Guildford'.",
      },
    },
  },
  {
    id: LOCAL_MARKET_OPERATION,
    question: "Which businesses of this kind are near this map point, with their ratings and reviews?",
    family: "Business Data",
    mode: "LIVE",
    path: "/v3/business_data/business_listings/search/live",
    costBand: "low",
    refresh: { everyDays: MARKET_REFRESH_DAYS },
    params: {
      categories: {
        kind: "text",
        required: true,
        description: "Google's own id for the kind of business: 'website_designer'.",
      },
      location_coordinate: {
        kind: "text",
        required: true,
        description: "The map point and how far round it, as 'latitude,longitude,kilometres'.",
      },
    },
  },
  {
    id: BUSINESS_PROFILE_OPERATION,
    question: "What does this business's Google Business Profile show today: rating, reviews, photos, hours, services?",
    family: "Business Data",
    mode: "LIVE",
    path: "/v3/business_data/google/my_business_info/live",
    costBand: "low",
    refresh: { everyDays: PROFILE_REFRESH_DAYS },
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "Google's place number for the business, as 'cid:17195342752822652591'.",
      },
    },
  },
  {
    id: MAP_CHECK_OPERATION,
    question: "Which businesses does Google Maps show, in order, for this search made from this map point?",
    family: "SERP",
    mode: "LIVE",
    path: "/v3/serp/google/maps/live/advanced",
    costBand: "low",
    params: {
      keyword: {
        kind: "keyword",
        required: true,
        description: "The search someone would type into Google Maps: 'web design guildford'.",
      },
      location_coordinate: {
        kind: "text",
        required: true,
        description: "Where the search is made from, as 'latitude,longitude,zoom': an office's own map point.",
      },
    },
  },
  {
    id: BUSINESS_POSTS_OPERATION,
    question: "What has this business posted on its Google profile lately: posts, offers and events?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/google/my_business_updates/task_post",
    resultPath: "/v3/business_data/google/my_business_updates/task_get/$id",
    costBand: "low",
    refresh: { everyDays: PROFILE_REFRESH_DAYS },
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "Google's place number for the business, as 'cid:17195342752822652591'.",
      },
    },
  },
  {
    id: TRUSTPILOT_FIND_OPERATION,
    question: "Which businesses on Trustpilot go by this name, with their rating and reviews?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/trustpilot/search/task_post",
    resultPath: "/v3/business_data/trustpilot/search/task_get/$id",
    costBand: "low",
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "The business's name, or its website: 'ronins'.",
      },
    },
  },
  {
    id: TRIPADVISOR_FIND_OPERATION,
    question: "Which places on Tripadvisor go by this name in the United Kingdom, with their rating and reviews?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/tripadvisor/search/task_post",
    resultPath: "/v3/business_data/tripadvisor/search/task_get/$id",
    costBand: "low",
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "The place's name and town: 'the ivy guildford'.",
      },
    },
  },
  {
    id: BUSINESS_QUESTIONS_OPERATION,
    question: "What have people asked on this business's Google profile, and has anyone answered?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/google/questions_and_answers/task_post",
    resultPath: "/v3/business_data/google/questions_and_answers/task_get/$id",
    costBand: "low",
    refresh: { everyDays: PROFILE_REFRESH_DAYS },
    params: {
      keyword: {
        kind: "text",
        required: true,
        description: "Google's place number for the business, as 'cid:17195342752822652591'.",
      },
    },
  },
];

/** Byte for byte what finding a business by name sends, so two finds of one name on one day are one purchase. */
export function listingFindParams(text: string): Record<string, unknown> {
  return { keyword: text.trim(), location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: 20 };
}

export function trustpilotFindParams(name: string): Record<string, unknown> {
  return { keyword: name.trim(), depth: 20 };
}

export function tripadvisorFindParams(name: string): Record<string, unknown> {
  return { keyword: name.trim(), location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: 20 };
}

/** What a watched profile's weekly reading sends: Google's place number, from the United Kingdom, in English. */
export function businessProfileParams(placeNumber: string): Record<string, unknown> {
  return { keyword: `cid:${placeNumber}`, location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en" };
}

/** A profile's posts, the newest ten. */
export function businessPostsParams(placeNumber: string): Record<string, unknown> {
  return { keyword: `cid:${placeNumber}`, location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: 10 };
}

/** The questions on a profile, twenty deep. */
export function businessQuestionsParams(placeNumber: string): Record<string, unknown> {
  return { keyword: `cid:${placeNumber}`, location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: 20 };
}

/** One search on Google Maps from an office's map point, as many businesses deep as its limit. */
export function mapCheckParams(keyword: string, point: string, depth: number): Record<string, unknown> {
  return { keyword, location_coordinate: `${point},${MAP_ZOOM}`, language_code: "en", depth };
}

/** The businesses of one kind within `km` of a map point, as many as its limit. */
export function localMarketParams(category: string, point: string, km: number, limit: number): Record<string, unknown> {
  return { categories: [category], location_coordinate: `${point},${km}`, limit };
}

/** The map point a map check or a market was asked from, read back from what was sent. */
export function pointAskedFrom(params: Record<string, unknown>): string | null {
  const coordinate = typeof params.location_coordinate === "string" ? params.location_coordinate.split(",") : [];
  return coordinate.length >= 2 ? `${coordinate[0]},${coordinate[1]}` : null;
}

/** How far round its point a market was asked, in kilometres. */
export function kmAskedFor(params: Record<string, unknown>): number | null {
  const coordinate = typeof params.location_coordinate === "string" ? params.location_coordinate.split(",") : [];
  const km = Number(coordinate[2]);
  return coordinate.length === 3 && Number.isFinite(km) ? km : null;
}

/** The place number a profile's reading or posts were asked for. */
export function placeNumberAskedFor(params: Record<string, unknown>): string | null {
  return typeof params.keyword === "string" && params.keyword.startsWith("cid:") ? params.keyword.slice(4) : null;
}

/** The start of the period a run falls in, for a purchase held `days`: every run in the period finds the one purchase by its key. */
export function localPeriodStart(startedAt: number, days: number): number {
  const period = days * 86_400_000;
  return Math.floor(startedAt / period) * period;
}
