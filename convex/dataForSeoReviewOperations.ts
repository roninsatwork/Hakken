import type { SeoOperation } from "./dataForSeoRegistry";
import { DEFAULT_LOCATION_CODE, countryCodeOf } from "./utils/seoLocations";

/**
 * What Discovery's Reviews pages buy (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 2): the reviews on a listing, newest first, from
 * Google, Trustpilot and Tripadvisor. Each body was tried with one paid call
 * on 2026-10-09 (§6A), and each price is that call's:
 *
 * - **Google reviews** (queued): $0.00075 for each ten, by Google's place
 *   number (`cid`), newest first — dates, stars, the reviewer, Local Guide or
 *   not, the owner's reply and its date; up to 4,490 a listing.
 * - **Trustpilot reviews** (queued): $0.00075 for twenty, by the website the
 *   page is for, newest first; the owner's replies with them.
 * - **Tripadvisor reviews** (queued): $0.0015 for ten, by the page's path.
 *
 * Bought for a company's own listings on every run, as many as are new since
 * the last (all of them the first time, D9), and for its rivals' the newest
 * few a month (`localRivalReviews`).
 */

export const GOOGLE_REVIEWS_OPERATION = "google_reviews";
export const TRUSTPILOT_REVIEWS_OPERATION = "trustpilot_reviews";
export const TRIPADVISOR_REVIEWS_OPERATION = "tripadvisor_reviews";

export const REVIEW_OPERATION_IDS: ReadonlySet<string> = new Set([
  GOOGLE_REVIEWS_OPERATION, TRUSTPILOT_REVIEWS_OPERATION, TRIPADVISOR_REVIEWS_OPERATION,
]);

export function isReviewOperation(operationId: string): boolean {
  return REVIEW_OPERATION_IDS.has(operationId);
}

/** The most reviews Google gives for one listing. */
export const GOOGLE_REVIEWS_MOST = 4_490;
/** How often a rival's reviews are read again. */
export const RIVAL_REVIEWS_DAYS = 30;

export const REVIEW_OPERATIONS: readonly SeoOperation[] = [
  {
    id: GOOGLE_REVIEWS_OPERATION,
    question: "What have people said in their Google reviews of this business, newest first, and did the owner reply?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/google/reviews/task_post",
    resultPath: "/v3/business_data/google/reviews/task_get/$id",
    costBand: "low",
    params: {
      cid: {
        kind: "text",
        required: true,
        description: "Google's place number for the business: '17195342752822652591'.",
      },
      depth: {
        kind: "number",
        required: false,
        description: "How many of the newest reviews to read, in tens: each ten is charged.",
        default: 10,
      },
    },
  },
  {
    id: TRUSTPILOT_REVIEWS_OPERATION,
    question: "What have people said in their Trustpilot reviews of this website's business, newest first?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/trustpilot/reviews/task_post",
    resultPath: "/v3/business_data/trustpilot/reviews/task_get/$id",
    costBand: "low",
    params: {
      // Text, not a host: a host parameter would have every website's run buy it (`seoSiteOperations`).
      domain: {
        kind: "text",
        required: true,
        description: "The website the Trustpilot page is for, exactly as Trustpilot writes it: 'www.rains.com'.",
      },
    },
  },
  {
    id: TRIPADVISOR_REVIEWS_OPERATION,
    question: "What have people said in their Tripadvisor reviews of this place, newest first?",
    family: "Business Data",
    mode: "QUEUED",
    path: "/v3/business_data/tripadvisor/reviews/task_post",
    resultPath: "/v3/business_data/tripadvisor/reviews/task_get/$id",
    costBand: "low",
    params: {
      url_path: {
        kind: "text",
        required: true,
        description: "The place's Tripadvisor page path: '/Restaurant_Review-g186390-d13958195-Reviews-…'.",
      },
    },
  },
];

/** Reviews asked for, in the supplier's steps of ten (Google) or twenty (Trustpilot), never past what one listing gives. */
export function reviewDepth(wanted: number, step: 10 | 20, most = GOOGLE_REVIEWS_MOST): number {
  return Math.min(most, Math.max(step, Math.ceil(wanted / step) * step));
}

export function googleReviewsParams(placeNumber: string, depth: number): Record<string, unknown> {
  return { cid: placeNumber, location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: reviewDepth(depth, 10), sort_by: "newest" };
}

export function trustpilotReviewsParams(domain: string, depth: number): Record<string, unknown> {
  return { domain, depth: reviewDepth(depth, 20), sort_by: "recency" };
}

export function tripadvisorReviewsParams(urlPath: string, depth: number): Record<string, unknown> {
  return { url_path: urlPath, location_code: countryCodeOf(DEFAULT_LOCATION_CODE), language_code: "en", depth: reviewDepth(depth, 10) };
}

/** The listing a reviews purchase was for, read back from what was sent: its source and its own number there. */
export function reviewListingAskedFor(operationId: string, params: Record<string, unknown>): { source: "GOOGLE" | "TRUSTPILOT" | "TRIPADVISOR"; key: string } | null {
  if (operationId === GOOGLE_REVIEWS_OPERATION && typeof params.cid === "string") return { source: "GOOGLE", key: params.cid };
  if (operationId === TRUSTPILOT_REVIEWS_OPERATION && typeof params.domain === "string") return { source: "TRUSTPILOT", key: params.domain };
  if (operationId === TRIPADVISOR_REVIEWS_OPERATION && typeof params.url_path === "string") return { source: "TRIPADVISOR", key: params.url_path };
  return null;
}
