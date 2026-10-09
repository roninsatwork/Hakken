import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { SeoOperation } from "./dataForSeoRegistry";
import {
  BUSINESS_POSTS_OPERATION,
  BUSINESS_PROFILE_OPERATION,
  BUSINESS_QUESTIONS_OPERATION,
  LOCAL_MARKET_OPERATION,
  MAP_CHECK_OPERATION,
  MARKET_REFRESH_DAYS,
  PROFILE_REFRESH_DAYS,
  LOCAL_OPERATIONS,
  businessPostsParams,
  businessProfileParams,
  businessQuestionsParams,
  localMarketParams,
  localPeriodStart,
  mapCheckParams,
} from "./dataForSeoLocalOperations";
import { partIsOn } from "./collectionParts";
import { readFanOutLimits } from "./fanOutLimits";
import { holdSearches } from "./holdLists";
import { counted, withinFanOutLimit, type PlannedCheck } from "./fanOutFirstCheckSteps";
import { SEO_KEYWORD_CHECKS_PER_WEBSITE } from "./seoCollectionPolicy";
import { isTrackedHold } from "./utils/websitePairing";
import { wordsOf } from "./utils/wordStarts";

/**
 * What a run buys for Discovery's Local pages (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 1), for one of a company's own websites —
 * and only when the company has Local switched on (D16). Its own module
 * because the collection planner (`seoCollection.ts`) is at its size ceiling;
 * the planner hands in how it plans one purchase, which is shared: the same
 * profile, map check or market asked by two companies is one purchase.
 *
 * - **Each office's and each watched rival's profile**, read whole once a
 *   week, and their posts and questions.
 * - **Every tracked search on Google Maps from each office's own map point**
 *   (D6, D21) — a search naming one office's town from that office only —
 *   every run.
 * - **Each office's local market**: the businesses of its main category round
 *   it, once a month.
 *
 * One step a purchase, always in the same order, so a planning page can stop
 * between any two and the next begin again at the same step.
 */

export type LocalPlan = (operation: SeoOperation, params: Record<string, unknown>, keyStartedAt: number | undefined, sendIndex: number) => Promise<PlannedCheck>;
type Step = (sendIndex: number) => Promise<{ planned: number; reused: number }>;

/** A website's links read at once: far past its offices and their rivals at their largest limits. */
const LINKS_READ = 200;

const operation = (id: string) => LOCAL_OPERATIONS.find((entry) => entry.id === id)!;

/** The offices a search is checked from: those whose town it names, or every office when it names none. */
export function officesForSearch<Office extends { town?: string }>(keyword: string, offices: readonly Office[]): Office[] {
  const words = ` ${wordsOf(keyword).join(" ")} `;
  const named = offices.filter((office) => {
    const town = office.town ? wordsOf(office.town).join(" ") : "";
    return town !== "" && words.includes(` ${town} `);
  });
  return named.length > 0 ? named : [...offices];
}

/**
 * A website's Local offices and the rivals watched against them, within its
 * limits: offices in the order they were linked, and at most so many rivals
 * against each (a rival against every office counts against each).
 */
export async function localWatchList(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">, limits: { localOffices: number; localRivalsPerOffice: number }) {
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LINKS_READ);
  const listings = new Map<string, Doc<"listings">>();
  for (const link of links) {
    const listing = await ctx.db.get(link.listingId);
    if (listing) listings.set(link.listingId, listing);
  }
  const offices = links
    .filter((link) => link.role === "OWN" && listings.get(link.listingId)?.source === "GOOGLE")
    .slice(0, limits.localOffices)
    .map((link) => listings.get(link.listingId)!);
  const officeIds = new Set(offices.map((office) => office._id as string));
  const perOffice = new Map<string, number>();
  const rivals: Array<Doc<"listings">> = [];
  for (const link of links) {
    const listing = listings.get(link.listingId);
    if (link.role !== "RIVAL" || listing?.source !== "GOOGLE") continue;
    const against = link.againstListingId && officeIds.has(link.againstListingId) ? [link.againstListingId as string] : [...officeIds];
    if (against.length === 0 || against.some((office) => (perOffice.get(office) ?? 0) >= limits.localRivalsPerOffice)) continue;
    for (const office of against) perOffice.set(office, (perOffice.get(office) ?? 0) + 1);
    rivals.push(listing);
  }
  return { offices, rivals };
}

/** The planning steps for one of a company's websites' Local pages; none when Local is off for the company. */
export async function localSteps(
  ctx: MutationCtx,
  cycle: Pick<Doc<"seoCollectionCycles">, "companyId" | "startedAt">,
  hold: Doc<"companyWebsites">,
  plan: LocalPlan,
): Promise<Step[]> {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, cycle.companyId, "local"))) return [];
  const limits = await readFanOutLimits(ctx, cycle.companyId, hold._id);
  const { offices, rivals } = await localWatchList(ctx, hold, limits);
  if (offices.length === 0 && rivals.length === 0) return [];

  const week = localPeriodStart(cycle.startedAt, PROFILE_REFRESH_DAYS);
  const month = localPeriodStart(cycle.startedAt, MARKET_REFRESH_DAYS);
  const one = (id: string, params: Record<string, unknown>, keyStartedAt?: number): Step =>
    async (sendIndex) => counted(await plan(operation(id), params, keyStartedAt, sendIndex));

  const steps: Step[] = [];
  for (const listing of [...offices, ...rivals]) {
    steps.push(one(BUSINESS_PROFILE_OPERATION, businessProfileParams(listing.key), week));
    steps.push(one(BUSINESS_POSTS_OPERATION, businessPostsParams(listing.key), week));
    steps.push(one(BUSINESS_QUESTIONS_OPERATION, businessQuestionsParams(listing.key), week));
  }
  for (const office of offices) {
    if (office.point && office.categoryIds?.[0]) {
      steps.push(one(LOCAL_MARKET_OPERATION, localMarketParams(office.categoryIds[0], office.point, limits.localMarketKm, limits.localMarketBusinesses), month));
    }
  }
  // The searches the website's Google checks are made for (`searchSteps` in `seoCollection.ts`), each from its offices.
  const searches = withinFanOutLimit(
    await holdSearches(ctx, hold._id, Math.min(SEO_KEYWORD_CHECKS_PER_WEBSITE, limits.trackedPerSite), { activeOnly: true }),
    limits.fanOutTrackedPerSite,
  );
  const placed = offices.filter((office) => office.point);
  for (const search of searches) {
    for (const office of officesForSearch(search.keyword, placed)) {
      steps.push(one(MAP_CHECK_OPERATION, mapCheckParams(search.keyword, office.point!, limits.localMapDepth)));
    }
  }
  return steps;
}
