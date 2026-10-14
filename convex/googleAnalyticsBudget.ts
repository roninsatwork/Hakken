import type { QuotaLeft } from "./googleAnalyticsApi";

/**
 * A Google Analytics run's budget for the hour (docs/plans/active/ga-stored-figures-plan.md
 * §2c): what is kept back of each of Google's allowances, and why the next
 * ask would go past it, in plain words with Google's own count. No database
 * here; the asks keep to it (`googleAnalyticsCollect.ask`).
 */

/**
 * Each run's budget, kept below Google's allowances so a run never meets
 * them — 120 asks an hour that may hold back small groups; tokens 14,000 an
 * hour for this platform's own asks, 40,000 an hour and 200,000 a day for the
 * property — read from what Google says is left (ga-stored-figures-plan.md
 * SF17; Anthony, 2026-10-14: "we know the quotas and we need to respect
 * them"). A fifth of each is kept in hand (AGENTS.md, "Respect Google's
 * quotas"), for an event's funnel asked from its screen and any other tool
 * reading the same property: the run asks nothing more once what Google says
 * is left comes down to it. An Analytics 360 property's ten times the tokens
 * keeps the same amounts back.
 */
export const KEPT_BACK = {
  /** A fifth of the 120 asks an hour that may hold back small groups: the run uses 96 at most. */
  thresholdedPerHour: 24,
  /** A fifth of the platform's own 14,000 tokens an hour. */
  tokensPerProjectPerHour: 2_800,
  /** A fifth of the property's 40,000 tokens an hour. */
  tokensPerHour: 8_000,
  /** A fifth of the property's 200,000 tokens a day. */
  tokensPerDay: 40_000,
} as const;

/** Why the budget stops the next ask, in plain words with Google's own count; null while there is room. */
export function overBudget(quota: QuotaLeft | null, thresholded: boolean): string | null {
  if (!quota) return null;
  const low = (left: number | null, kept: number) => left !== null && left <= kept;
  if (thresholded && low(quota.thresholdedPerHour, KEPT_BACK.thresholdedPerHour)) {
    return `the hour's asks of age, gender and interests are used to the budget: Google says ${quota.thresholdedPerHour} are left`;
  }
  if (low(quota.tokensPerProjectPerHour, KEPT_BACK.tokensPerProjectPerHour)) return `the hour's tokens are used to the budget: Google says ${quota.tokensPerProjectPerHour} of the platform's own are left`;
  if (low(quota.tokensPerHour, KEPT_BACK.tokensPerHour)) return `the website's tokens this hour are used to the budget: Google says ${quota.tokensPerHour} are left`;
  if (low(quota.tokensPerDay, KEPT_BACK.tokensPerDay)) return `the website's tokens today are used to the budget: Google says ${quota.tokensPerDay} are left`;
  return null;
}

/** What Google said is left, and when: kept on the connection between a run's steps, its fills and its hours. */
export type QuotaSeen = QuotaLeft & { at: number };

/**
 * How long the hour's counts Google last gave are taken as still true: long
 * enough for one step of a run to follow another, never across a wait for the
 * hour. On 2026-10-14 a count taken as true for a whole hour kept a run waiting
 * a second hour it did not need; after a wait, Google's own next answer says.
 */
export const SEEN_FOR_MS = 10 * 60 * 1000;

/** The calendar day in Google's own time, Pacific, when its daily allowance starts again. */
export function googleDay(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * What a new session may still take as left (AGENTS.md, "Respect Google's
 * quotas"): the hour's counts for ten minutes (`SEEN_FOR_MS`), the day's
 * while Google's day has not turned. Older than that, Google's next answer
 * says again; never seen, null, as before.
 */
export function quotaStillSeen(seen: QuotaSeen | null | undefined, now: number): QuotaLeft | null {
  if (!seen) return null;
  const hour = now - seen.at < SEEN_FOR_MS;
  const day = googleDay(seen.at) === googleDay(now);
  if (!hour && !day) return null;
  return {
    tokensPerDay: day ? seen.tokensPerDay : null,
    tokensPerHour: hour ? seen.tokensPerHour : null,
    tokensPerProjectPerHour: hour ? seen.tokensPerProjectPerHour : null,
    thresholdedPerHour: hour ? seen.thresholdedPerHour : null,
  };
}

/** Google's refusal of an ask for an allowance that refreshes within the hour. */
export const HOURLY_REFUSAL = /under an hour|per hour|hourly/i;
