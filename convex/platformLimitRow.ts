import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * The platform's own limits row (System Settings → Limits,
 * docs/plans/active/platform-limits-plan.md), or null while nobody has set
 * one. Its own module so the two sets of limits — `companyDataLimits.ts` and
 * `fanOutLimits.ts` — can read it for their last step without importing
 * `platformLimits.ts`, which imports them.
 */
export async function readPlatformLimitRow(ctx: { db: QueryCtx["db"] }): Promise<Doc<"platformLimits"> | null> {
  return await ctx.db.query("platformLimits").first();
}
