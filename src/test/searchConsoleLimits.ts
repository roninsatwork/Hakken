import type { ConsoleLimits } from "@/convex/searchConsoleLimits";

/**
 * A website's Search Console limits as they start — each limit's `fallback` in
 * `convex/fanOutLimits.ts` (search-console-plan.md §17.5) — for the status a
 * screen test answers with.
 */
export const STARTING_CONSOLE_LIMITS: ConsoleLimits = {
  listRows: 25_000,
  pairedRows: 8_000,
  liveFactsRows: 5_000,
  richResultKinds: 20,
  topCountries: 5,
  newLostRows: 5_000,
  newAfterDays: 14,
  lostAfterDays: 14,
  missedKeywords: 500,
  searchedALot: 100,
  barelyShown: 50,
  estimateOff: 25,
  curvePositions: 20,
  updatesListed: 100,
  updateWindowDays: 14,
  chartWeeks: 16,
  longestRange: 800,
};
