import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Where the hourly sweep has thinned keyword positions to a week's last
 * (docs/plans/active/dataforseo-cost-plan.md, B1; `positionWeeks.ts`), in a
 * file of its own to keep `schema.ts` inside its size band.
 */
export const positionWeekTables = {
  /**
   * One row: every day before `day` is thinned, and `day` itself up to
   * `cursor`. Each day is read once, the day it passes the 90 days kept day by
   * day — never the weeks already thinned, which are kept for ever.
   */
  positionThinning: defineTable({
    day: v.string(),
    cursor: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
};
