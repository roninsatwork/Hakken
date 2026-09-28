import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * The day a request's results belong to: the day its collection run started,
 * so a run that finishes after midnight UTC files all of itself as one day's
 * check; a request outside any run, the day it was made. Dated by when each
 * came back, the everyday keywords of a run begun at 23:00 UTC landed a day
 * after its list, and the newest "ranking day" held only them
 * (docs/plans/active/sites-audit-fixes-plan.md, 2.1).
 */
export async function runDayOf(
  ctx: { db: QueryCtx["db"] },
  pull: Pick<Doc<"seoDataPulls">, "cycleId" | "submittedAt">,
): Promise<string> {
  const cycle = pull.cycleId ? await ctx.db.get(pull.cycleId) : null;
  return new Date(cycle?.startedAt ?? pull.submittedAt).toISOString().slice(0, 10);
}
