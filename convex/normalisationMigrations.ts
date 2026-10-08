import type { MutationCtx } from "./_generated/server";
import { packRankFacts } from "./siteRankings";
import { rebuildEveryCopy } from "./siteListCopies";
import { moveDecisionCalls } from "./decisionLedger";
import { lowerSavedCostRowKeep } from "./purgeScheduleService";

type Batch = { cursor: string | null; isDone: boolean; processed: number; updated: number };

/**
 * The core-data-normalisation plan's one-off moves of data already kept
 * (docs/plans/active/core-data-normalisation-plan.md), run by name through
 * `dataMigrations.run` like every other: kept in their own list so the plan's
 * steps do not push `dataMigrations.ts` past the module ceiling.
 */
export const NORMALISATION_MIGRATIONS: Record<string, (ctx: MutationCtx, cursor: string | null, batchSize: number) => Promise<Batch>> = {
  /** Ranking rows' months and results-page features packed, their stored band cleared (`siteRankings.packRankFacts`). */
  "2026-10-08-pack-rank-facts": packRankFacts,
  /** Every compact copy built again, kept as columns (`utils/copyColumns.ts`). */
  "2026-10-08-copies-as-columns": rebuildEveryCopy,
  /** Each Decision's cost row moved onto the Decision it paid for (`decisionLedger.ts`, §7.1). */
  "2026-10-08-decision-calls-on-runs": moveDecisionCalls,
  /** A saved purge setting keeping AI calls' costs the old 400 days lowered to 90 (N9). */
  "2026-10-08-cost-rows-90-days": (ctx) => lowerSavedCostRowKeep(ctx),
};
