import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { creditKindOfFamily, creditUnitsOfRequest } from "./creditKinds";
import { findSeoOperation } from "./dataForSeoRegistry";
import { boughtForCompetitor, competitorFirstPageOnly } from "./seoBuyingRules";
import { sentOffset } from "./sitePagedLists";

/**
 * What a competitor's scheduled check will charge under today's buying rules
 * — Usage → Coming up (docs/plans/active/finish-off-plan.md, item 15).
 *
 * Coming up books each check at what its last run charged
 * (`scheduledChecks` in `creditUsage.ts`). A competitor's last run, bought
 * before 2026-10-05, charged for its crawl, every link list and its whole
 * keyword list; from now it is bought only what benchmarking needs
 * (`seoBuyingRules.ts`) — so its next runs are booked at the share of that
 * charge today's rules still buy: its Site audit at nothing, never crawled;
 * its links and keywords at the units of the lines it would still be bought,
 * the keyword list's first page alone. A last run bought under today's rules
 * comes back as it was.
 */

/** A website's lines read from its last run, to share that run's charge out. */
const LINES_READ = 300;

/** What a competitor's next runs of a check will charge, from its last; null to book the last as it was. */
export async function competitorChargeUnderTodaysRules(
  ctx: { db: QueryCtx["db"] },
  charge: Doc<"creditCharges">,
): Promise<number | null> {
  if (charge.kind === "siteAudit") return 0;
  if (!charge.kind || !charge.cycleId || !charge.websiteId) return null;
  const websiteId = charge.websiteId;
  const cycle = await ctx.db.get(charge.cycleId);
  if (!cycle) return null;
  const lines = (await ctx.db
    .query("seoCycleLines")
    .withIndex("by_company_website", (q) => q.eq("companyId", charge.companyId).eq("websiteId", websiteId).gte("createdAt", cycle.startedAt))
    .take(LINES_READ))
    .filter((line) => line.cycleId === charge.cycleId);
  let total = 0;
  let kept = 0;
  for (const line of lines) {
    const family = findSeoOperation(line.operationId)?.family;
    if (!family || creditKindOfFamily(family) !== charge.kind) continue;
    const pull = await ctx.db.get(line.pullId);
    if (!pull) continue;
    const units = creditUnitsOfRequest(charge.kind, pull.taskArgsJson);
    total += units;
    const stillBought = boughtForCompetitor(line.operationId)
      && !(competitorFirstPageOnly(line.operationId) && sentOffset(pull.taskArgsJson) > 0);
    if (stillBought) kept += units;
  }
  if (total === 0 || kept === total) return null;
  return Math.ceil((charge.creditsOut * kept) / total);
}
