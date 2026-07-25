import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Shared writes against a run's durable state.
 *
 * These were private to `agentRuns.ts`. The stalled-run sweeper needs the same
 * two operations, and a sweeper implemented as a mutation cannot delegate to
 * another mutation, so they live here rather than being copied. Both take the
 * database directly and are used from inside a transaction.
 */

export const AGENT_RUN_MEMORY_USAGE_LIMIT = 500;

export type TerminalRunStatus = "SUCCESS" | "FAILED" | "CANCELLED";

/** The next free step index for a run, so appended steps stay ordered and unique. */
export async function getNextStepIndex(
  ctx: Pick<MutationCtx, "db">,
  runId: Id<"agentRuns">,
) {
  const latestStep = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", runId))
    .order("desc")
    .first();

  return (latestStep?.stepIndex ?? 0) + 1;
}

/**
 * Record how a run ended against every memory it consulted.
 *
 * This is what lets memory quality be judged later: a memory repeatedly present
 * in failed runs is a candidate for revision. It must therefore be written on
 * *every* terminal path, including the ones that end without the runtime being
 * alive to do it.
 */
export async function updateMemoryUsageOutcomeForRun(
  ctx: Pick<MutationCtx, "db">,
  runId: Id<"agentRuns">,
  status: TerminalRunStatus,
) {
  const now = Date.now();
  const usageRows = await ctx.db
    .query("agentMemoryUsage")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(AGENT_RUN_MEMORY_USAGE_LIMIT);

  await Promise.all(usageRows.map((usage) =>
    ctx.db.patch(usage._id, {
      outcome: status,
      updatedAt: now,
    })
  ));
}
