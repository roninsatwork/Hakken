import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { readPlatformLimitRow } from "./platformLimitRow";

/**
 * The limits only the platform sets (docs/plans/active/platform-limits-plan.md):
 * each is about something every company shares — one AI answer serves every
 * company asking the same prompt, one purchase every company watching the
 * same site — or about the platform itself, so a company or a website cannot
 * have its own. Fixed in code until 2026-09-28, when Anthony, seeing them
 * read-only on System Settings → Limits, asked "why are these not drop downs
 * and configurable".
 *
 * Each starts at the number the code used, so nothing changed on the day they
 * became settings, and its largest choice is the most the code safely takes.
 */
export const SHARED_LIMITS = {
  /** Fan-out queries kept from one AI answer: an engine publishes a handful, so this is a guard, not a judgment. */
  fanOutPerAnswer: { choices: [25, 50, 100], fallback: 50 },
  /** Cited sources kept from one AI answer: an engine rarely cites more than a dozen. */
  sourcesPerAnswer: { choices: [20, 40, 80], fallback: 40 },
  /** Businesses kept from one AI answer, in the order it names them, each judged for how it is spoken of. */
  businessesPerAnswer: { choices: [100, 200, 400], fallback: 200 },
  /** Websites one competitor purchase meets for the first time, kept and judged as suggestions. */
  newWebsitesPerPurchase: { choices: [25, 50, 100], fallback: 50 },
  /** Searches kept from one Google AI Overviews purchase, most run first: 250 overviews run about ten each. */
  overviewSearchesPerPurchase: { choices: [500, 1_000, 2_000], fallback: 2_000 },
  /** Rows one download holds: a file much past 50,000 would outgrow what one function may return. */
  rowsPerDownload: { choices: [10_000, 25_000, 50_000], fallback: 50_000 },
} as const satisfies Record<string, { choices: readonly number[]; fallback: number }>;

export type SharedLimitKey = keyof typeof SHARED_LIMITS;
export type SharedLimits = Record<SharedLimitKey, number>;

export const SHARED_LIMIT_KEYS = Object.keys(SHARED_LIMITS) as SharedLimitKey[];

/** The most a shared limit can be set to: what a read that must cover any setting takes. */
export function sharedLimitCeiling(key: SharedLimitKey): number {
  return Math.max(...SHARED_LIMITS[key].choices);
}

/** The platform's numbers: its own where it set them, else the number the code used. */
export function sharedLimitsOf(platform: Doc<"platformLimits"> | null): SharedLimits {
  return Object.fromEntries(SHARED_LIMIT_KEYS.map((key) => [key, platform?.[key] ?? SHARED_LIMITS[key].fallback])) as SharedLimits;
}

export async function readSharedLimits(ctx: { db: QueryCtx["db"] }): Promise<SharedLimits> {
  return sharedLimitsOf(await readPlatformLimitRow(ctx));
}

/** The shared limits, for the parse and export actions, which cannot read the database themselves. */
export const getSharedLimits = internalQuery({
  args: {},
  returns: v.object({
    fanOutPerAnswer: v.number(),
    sourcesPerAnswer: v.number(),
    businessesPerAnswer: v.number(),
    newWebsitesPerPurchase: v.number(),
    overviewSearchesPerPurchase: v.number(),
    rowsPerDownload: v.number(),
  }),
  handler: async (ctx): Promise<SharedLimits> => await readSharedLimits(ctx),
});
