import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** The kinds kept month by month and never asked again once held, whose enquiries are the counted events' (`insightHistory.ts`). */
const COUNTED_KINDS = ["GA_PAGES", "GA_PAGE_SOURCES"] as const;
/** Months of one kind a website holds: sixteen, with room. */
const MONTHS_HELD = 40;

/**
 * Forget a website's months whose enquiries were counted another way, so
 * Insights' next run asks them again: when what counts changes, and when the
 * website's figures are collected again by Google's own counts
 * (docs/plans/active/conversions-back-in-time-plan.md BT3, BT6). Every other
 * kind is asked whole on each run already. Apart from `insightHistory.ts`,
 * which asks Google through the collection's module, so the collection can
 * call this without the two importing each other.
 */
export async function forgetCountedHistory(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  for (const kind of COUNTED_KINDS) {
    const held = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", holdId).eq("kind", kind)).take(MONTHS_HELD);
    for (const record of held) await ctx.db.delete(record._id);
  }
}
