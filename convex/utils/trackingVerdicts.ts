import { v } from "convex/values";

/**
 * What the Tracking screen calls each row, and the thresholds behind it.
 *
 * **Verdicts are opinions with money attached**, which is why every threshold
 * is here, named, and printed on the screen that uses it rather than buried in
 * a helper. The numbers are guesses stated as guesses — the plan's open
 * question one — and changing one is one edit, here, which the screen then
 * reads back.
 *
 * In `utils/` because a client screen prints them, and importing a Convex
 * module that defines functions ships the backend to the browser.
 */

/** The verdicts as validators, for the queries that return them — admin's and the client's. */
export const searchVerdictValidator = v.union(
  v.literal("NOT_CHECKED"), v.literal("TOO_NEW"), v.literal("TOP_THREE"), v.literal("PAGE_ONE"),
  v.literal("SLIPPING"), v.literal("RANKING"), v.literal("NOT_FOUND"), v.literal("NEVER_RANKED"),
);

export const rivalVerdictValidator = v.union(
  v.literal("TOO_NEW"), v.literal("AHEAD"), v.literal("LEVEL"),
  v.literal("BEHIND"), v.literal("GONE_QUIET"), v.literal("NOT_CHECKED"),
);

export const VERDICT_THRESHOLDS = {
  /** Under this many days, a row is too new to judge either way. */
  tooNewDays: 28,
  /** A question asked this many days and never named has never landed. */
  neverLandedDays: 56,
  /** A search checked this many days and never on the page has never ranked. */
  neverRankedDays: 56,
  /** Down more than this many places since the check before is slipping. */
  slippingPlaces: 3,
  /** The last position that is still page one. */
  pageOne: 10,
  topThree: 3,
  /** A rival not seen on any page or in any answer for this long has dropped out. */
  goneQuietDays: 56,
} as const;

/** Whole days from one ISO day to another. Negative if `to` is earlier. */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

export type SearchVerdict =
  | "NOT_CHECKED"
  | "TOO_NEW"
  | "TOP_THREE"
  | "PAGE_ONE"
  | "SLIPPING"
  | "RANKING"
  | "NOT_FOUND"
  | "NEVER_RANKED";

export type SearchStatsInput = {
  firstCheckedDay: string;
  lastPosition?: number;
  previousPosition?: number;
  everRanked: boolean;
};

/**
 * One search, judged.
 *
 * Slipping beats everything, because a search falling off page one is the
 * thing somebody has to act on this week. A search already on page one is
 * reported as such even in its first month — "too new to say" is for a search
 * that has not shown anything yet, not one that has.
 */
export function searchVerdict(stats: SearchStatsInput | null, today: string): SearchVerdict {
  if (!stats) return "NOT_CHECKED";
  const { lastPosition, previousPosition } = stats;

  const fell = previousPosition !== undefined && (
    lastPosition === undefined || lastPosition - previousPosition > VERDICT_THRESHOLDS.slippingPlaces
  );
  if (fell) return "SLIPPING";
  if (lastPosition !== undefined && lastPosition <= VERDICT_THRESHOLDS.topThree) return "TOP_THREE";
  if (lastPosition !== undefined && lastPosition <= VERDICT_THRESHOLDS.pageOne) return "PAGE_ONE";

  const age = daysBetween(stats.firstCheckedDay, today);
  if (age < VERDICT_THRESHOLDS.tooNewDays) return "TOO_NEW";
  if (lastPosition !== undefined) return "RANKING";
  if (!stats.everRanked && age >= VERDICT_THRESHOLDS.neverRankedDays) return "NEVER_RANKED";
  return "NOT_FOUND";
}

export type QuestionVerdict =
  | "NOT_ASKED"
  | "TOO_NEW"
  | "WARNED"
  | "NEVER_LANDED"
  | "THIN"
  | "EARNING";

export type QuestionStatsInput = {
  asked: number;
  named: number;
  warnedAgainst: number;
  firstAskedDay: string;
};

/**
 * One question, judged across the engines it is put to.
 *
 * Warned-against beats everything: an engine telling people to avoid the
 * business is worth reading in full whatever else is true. Earning its keep
 * means named in at least half the answers.
 */
export function questionVerdict(stats: QuestionStatsInput | null, today: string): QuestionVerdict {
  if (!stats || stats.asked === 0) return "NOT_ASKED";
  if (stats.warnedAgainst > 0) return "WARNED";
  if (stats.named * 2 >= stats.asked) return "EARNING";

  const age = daysBetween(stats.firstAskedDay, today);
  if (age < VERDICT_THRESHOLDS.tooNewDays) return "TOO_NEW";
  if (stats.named === 0 && age >= VERDICT_THRESHOLDS.neverLandedDays) return "NEVER_LANDED";
  return "THIN";
}

export type RivalVerdict = "TOO_NEW" | "AHEAD" | "LEVEL" | "BEHIND" | "GONE_QUIET" | "NOT_CHECKED";

/**
 * One rival against the site it is watched against.
 *
 * `beatsYouOn` and `youBeatOn` count the site's own searches where one is
 * above the other on the same page, from the same place. "Gone quiet" is a
 * rival seen on no page and in no answer for the threshold — which is costing
 * money to confirm nothing.
 */
export function rivalVerdict(input: {
  beatsYouOn: number;
  youBeatOn: number;
  lastSeenDay: string | null;
  trackedSinceDay: string;
}, today: string): RivalVerdict {
  if (daysBetween(input.trackedSinceDay, today) < VERDICT_THRESHOLDS.tooNewDays) return "TOO_NEW";
  if (!input.lastSeenDay) return "NOT_CHECKED";
  if (daysBetween(input.lastSeenDay, today) >= VERDICT_THRESHOLDS.goneQuietDays) return "GONE_QUIET";
  if (input.beatsYouOn > input.youBeatOn) return "AHEAD";
  if (input.beatsYouOn < input.youBeatOn) return "BEHIND";
  return "LEVEL";
}

/** Rows that need somebody's attention sort first. Lower is more urgent. */
export const SEARCH_ATTENTION: Record<SearchVerdict, number> = {
  SLIPPING: 0,
  NEVER_RANKED: 1,
  NOT_FOUND: 2,
  RANKING: 3,
  TOO_NEW: 4,
  NOT_CHECKED: 5,
  PAGE_ONE: 6,
  TOP_THREE: 7,
};

export const RIVAL_ATTENTION: Record<RivalVerdict, number> = {
  AHEAD: 0,
  GONE_QUIET: 1,
  LEVEL: 2,
  BEHIND: 3,
  TOO_NEW: 4,
  NOT_CHECKED: 5,
};

/**
 * How many times a schedule collects in an average month.
 *
 * What turns the price of one pull into what a row costs to keep. Null for
 * anything the SEO schedule cannot produce, rather than a guess.
 */
export function pullsPerMonth(intervalStr: string | null | undefined): number | null {
  if (!intervalStr) return null;
  try {
    const parsed = JSON.parse(intervalStr) as { kind?: string; cadence?: string };
    if (parsed.kind !== "recurring") return null;
    switch (parsed.cadence) {
      case "daily": return 365 / 12;
      case "weekly": return 52 / 12;
      case "fortnightly": return 26 / 12;
      case "monthly": return 1;
      default: return null;
    }
  } catch {
    return null;
  }
}
