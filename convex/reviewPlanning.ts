import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { partIsOn } from "./collectionParts";
import { readFanOutLimits } from "./fanOutLimits";
import { counted } from "./fanOutFirstCheckSteps";
import { localPeriodStart } from "./dataForSeoLocalOperations";
import {
  GOOGLE_REVIEWS_MOST,
  GOOGLE_REVIEWS_OPERATION,
  REVIEW_OPERATIONS,
  RIVAL_REVIEWS_DAYS,
  TRIPADVISOR_REVIEWS_OPERATION,
  TRUSTPILOT_REVIEWS_OPERATION,
  googleReviewsParams,
  tripadvisorReviewsParams,
  trustpilotReviewsParams,
} from "./dataForSeoReviewOperations";
import { localWatchList, type LocalPlan } from "./localPlanning";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * What a run buys for Discovery's Reviews pages (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 2, D8, D9), for one of a company's own
 * websites while it has Reviews switched on (D16):
 *
 * - **Its own listings' reviews every run, the new ones only** — all of them
 *   the first time, up to the 4,490 Google gives — and again the newest down
 *   to the oldest still waiting for a reply in 90 days, so a late reply shows.
 *   Worked out from the listing's light reading (`reviewsHeld`,
 *   `reviewsRecheck`) against its review count, never by reading the reviews.
 * - **Its rivals' newest few each month** (`localRivalReviews`, 50).
 */

type Step = (sendIndex: number) => Promise<{ planned: number; reused: number }>;

/** Reviews read past what is known to be new: one more page, in case the count lags. */
const SLACK = 10;
/** A website's links read at once, as Local reads them. */
const LINKS_READ = 200;

const operation = (id: string) => REVIEW_OPERATIONS.find((entry) => entry.id === id)!;

function paramsFor(listing: Doc<"listings">, depth: number): { id: string; params: Record<string, unknown> } {
  if (listing.source === "TRUSTPILOT") return { id: TRUSTPILOT_REVIEWS_OPERATION, params: trustpilotReviewsParams(listing.key, depth) };
  if (listing.source === "TRIPADVISOR") return { id: TRIPADVISOR_REVIEWS_OPERATION, params: tripadvisorReviewsParams(listing.key, depth) };
  return { id: GOOGLE_REVIEWS_OPERATION, params: googleReviewsParams(listing.key, depth) };
}

/** How many of an own listing's newest reviews to read this run: all at first, then what is new and what still waits. */
export function ownReviewDepth(listing: Pick<Doc<"listings">, "reviews" | "reviewsHeld" | "reviewsRecheck">): number {
  if (listing.reviewsHeld === undefined) return Math.min(GOOGLE_REVIEWS_MOST, Math.max(SLACK, listing.reviews ?? 50));
  const fresh = Math.max(0, (listing.reviews ?? listing.reviewsHeld) - listing.reviewsHeld);
  return Math.min(GOOGLE_REVIEWS_MOST, fresh + (listing.reviewsRecheck ?? 0) + SLACK);
}

export async function reviewSteps(
  ctx: MutationCtx,
  cycle: Pick<Doc<"seoCollectionCycles">, "companyId" | "startedAt">,
  hold: Doc<"companyWebsites">,
  plan: LocalPlan,
): Promise<Step[]> {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, cycle.companyId, "reviews"))) return [];
  const limits = await readFanOutLimits(ctx, cycle.companyId, hold._id);
  const { offices, rivals } = await localWatchList(ctx, hold, limits);
  // Pages on Trustpilot and Tripadvisor, the company's own and its rivals', beside the Google profiles.
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LINKS_READ);
  const elsewhere: Array<{ listing: Doc<"listings">; own: boolean }> = [];
  for (const link of links) {
    const listing = await ctx.db.get(link.listingId);
    if (listing && listing.source !== "GOOGLE") elsewhere.push({ listing, own: link.role === "OWN" });
  }
  const month = localPeriodStart(cycle.startedAt, RIVAL_REVIEWS_DAYS);
  const steps: Step[] = [];
  const own = [...offices, ...elsewhere.filter((entry) => entry.own).map((entry) => entry.listing)];
  for (const listing of own) {
    const { id, params } = paramsFor(listing, ownReviewDepth(listing));
    steps.push(async (sendIndex) => counted(await plan(operation(id), params, undefined, sendIndex)));
  }
  for (const listing of [...rivals, ...elsewhere.filter((entry) => !entry.own).map((entry) => entry.listing)]) {
    const { id, params } = paramsFor(listing, limits.localRivalReviews);
    steps.push(async (sendIndex) => counted(await plan(operation(id), params, month, sendIndex)));
  }
  return steps;
}
