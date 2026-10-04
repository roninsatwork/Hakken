import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { daysIn } from "./searchConsoleDays";
import { appError } from "./utils/appError";
import type { ViewRules } from "./utils/searchConsoleViews";

/**
 * The limits the Search Console screens read by and the rules they decide by
 * (search-console-plan.md §17): one website's, from the Limits screens — its
 * own, else its company's, else the platform's (`fanOutLimits.ts`). Each was
 * a number fixed in code until the drift audit of 2026-10-03 (Anthony: "we
 * need limits in the limits sections"); read once per read, by the hold.
 */

export const consoleLimitsValidator = v.object({
  listRows: v.number(),
  pairedRows: v.number(),
  liveFactsRows: v.number(),
  richResultKinds: v.number(),
  topCountries: v.number(),
  newLostRows: v.number(),
  newAfterDays: v.number(),
  lostAfterDays: v.number(),
  missedKeywords: v.number(),
  searchedALot: v.number(),
  barelyShown: v.number(),
  /** Per cent of Google's clicks. */
  estimateOff: v.number(),
  curvePositions: v.number(),
  updatesListed: v.number(),
  updateWindowDays: v.number(),
  chartWeeks: v.number(),
  longestRange: v.number(),
});
export type ConsoleLimits = Infer<typeof consoleLimitsValidator>;

/** One website's Search Console limits. */
export async function consoleLimitsOf(ctx: { db: QueryCtx["db"] }, hold: Pick<Doc<"companyWebsites">, "_id" | "companyId">): Promise<ConsoleLimits> {
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  return {
    listRows: limits.consoleListRows,
    pairedRows: limits.consolePairedRows,
    liveFactsRows: limits.consoleLiveFactsRows,
    richResultKinds: limits.consoleRichResultKinds,
    topCountries: limits.consoleTopCountries,
    newLostRows: limits.consoleNewLostRows,
    newAfterDays: limits.consoleNewAfterDays,
    lostAfterDays: limits.consoleLostAfterDays,
    missedKeywords: limits.consoleMissedKeywords,
    searchedALot: limits.consoleSearchedALot,
    barelyShown: limits.consoleBarelyShown,
    estimateOff: limits.consoleEstimateOff,
    curvePositions: limits.consoleCurvePositions,
    updatesListed: limits.consoleUpdatesListed,
    updateWindowDays: limits.consoleUpdateWindowDays,
    chartWeeks: limits.consoleChartWeeks,
    longestRange: limits.consoleLongestRange,
  };
}

/** The rules a page's view decides by, from the website's limits. */
export function viewRulesOf(limits: ConsoleLimits): ViewRules {
  return {
    curvePositions: limits.curvePositions,
    barelyShown: limits.barelyShown,
    searchedALot: limits.searchedALot,
    estimateOff: limits.estimateOff / 100,
  };
}

/** Dates no longer than the website's longest date range: a refusal the page can show. */
export function checkedLongest(from: string, to: string, limits: ConsoleLimits): void {
  if (daysIn(from, to) > limits.longestRange) {
    throw appError("INVALID_INPUT", `Choose at most ${limits.longestRange} days at once: that is this website's longest date range, set on its Limits page.`);
  }
}
