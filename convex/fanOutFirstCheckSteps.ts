import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { holdFirstChecksDue } from "./holdLists";
import { listedChecker } from "./fanOutListed";
import { fileFirstCheckLate } from "./seoKeywordChecks";

/**
 * Planning a website's Google checks around its fan-out queries
 * (docs/plans/active/fan-out-opt-in-plan.md): the ticked ones up to the
 * website's limit for them, and each one's single first check. Its own module
 * because the collection planner (`seoCollection.ts`) is at its size ceiling.
 * The planner hands in how it plans one check, so a first check is bought
 * exactly as a tracked search is — keyed on the search and the place, and
 * shared with everyone asking the same that day.
 */

/** A Google check planned for one search: whether it reused one already bought, and which. */
export type PlannedCheck = { reused: boolean; pullId: Id<"seoDataPulls">; pull: Doc<"seoDataPulls"> | null };

/** What a planning step reports: a purchase planned, or one reused. */
export const counted = (outcome: PlannedCheck) => (outcome.reused ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 });

/**
 * The running tracked searches a run checks: every one typed in by hand, and
 * the fan-out queries ticked up to the website's limit for them — lowered
 * below what is ticked, the first ticked are.
 */
export function withinFanOutLimit(searches: readonly Doc<"websiteKeywords">[], limit: number): Doc<"websiteKeywords">[] {
  const kept = new Set(searches.filter((search) => search.addedFrom === "AI_SEARCH").slice(0, limit).map((search) => search._id));
  return searches.filter((search) => search.addedFrom !== "AI_SEARCH" || kept.has(search._id));
}

/**
 * One step a first check, in the room the website's checks have left: each
 * fan-out query of its lists not checked yet, bought once and asked again only
 * after a failure. A check it reuses that was filed before this website asked
 * is filed for the website at once (`fileFirstCheckLate`). One no longer on
 * any list — its prompt removed, say — is not bought, and its record goes.
 */
export async function firstCheckSteps(
  ctx: MutationCtx,
  hold: Doc<"companyWebsites">,
  room: number,
  check: (query: string, sendIndex: number) => Promise<PlannedCheck>,
) {
  const listed = listedChecker(ctx, hold._id);
  return (await holdFirstChecksDue(ctx, hold._id, room)).map((due) => async (sendIndex: number) => {
    // Read again: an earlier page of this run may have planned it, or its check come back since.
    const first = await ctx.db.get(due._id);
    if (!first || first.checkedDay) return { planned: 0, reused: 0 };
    if (!first.pullId && !(await listed(first.query))) {
      await ctx.db.delete(first._id);
      return { planned: 0, reused: 0 };
    }
    const asked = first.pullId ? await ctx.db.get(first.pullId) : null;
    if (asked && asked.status !== "FAILED") {
      // Filed before this website asked: file it for the website now. On its way: its filing will.
      if (asked.filedAt !== undefined) await fileFirstCheckLate(ctx, first, asked);
      return { planned: 0, reused: 0 };
    }
    const outcome = await check(first.query, sendIndex);
    await ctx.db.patch(first._id, { pullId: outcome.pullId });
    if (outcome.pull?.filedAt !== undefined) await fileFirstCheckLate(ctx, { ...first, pullId: outcome.pullId }, outcome.pull);
    return counted(outcome);
  });
}
