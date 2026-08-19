import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildAgentActionAuditMetadata, isAuditableAgentAction } from "./auditLogService";

/**
 * Shared writes against a run's durable state.
 *
 * These were private to `agentRuns.ts`. The stalled-run sweeper needs the same
 * two operations, and a sweeper implemented as a mutation cannot delegate to
 * another mutation, so they live here rather than being copied. Both take the
 * database directly and are used from inside a transaction.
 */

export const AGENT_RUN_MEMORY_USAGE_LIMIT = 500;

/**
 * What an agent did on its own account, on the trail.
 *
 * A person changing an agent's purpose was recorded and the agent then acting
 * was not, which on a platform sold as AI governance is the conspicuous hole in
 * it.
 *
 * Reads never reach here. An agent answering a question by looking something up
 * is the bulk of what agents do, and putting all of it on the trail would bury
 * the entries that matter within a week. What is recorded is what an agent
 * changed, deleted, or sent outside.
 *
 * No actor. An agent is not a person, and naming whoever started the run as the
 * one who did this would put a human name against an action they did not take —
 * which is the precise thing an accountability record must not do. The run and
 * the agent are both on the entry, so the person who set it going is one hop
 * away.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export async function recordAgentAction(
  ctx: MutationCtx,
  args: {
    agentId: Id<"agents">;
    companyId?: Id<"companies">;
    runId: Id<"agentRuns">;
    tool: string;
    sideEffectLevel: string;
    status: string;
    error?: string;
    wasApproved?: boolean;
    timestamp: number;
  },
) {
  if (!isAuditableAgentAction(args.sideEffectLevel)) return;

  const agent = await ctx.db.get(args.agentId);

  await ctx.db.insert("auditLogs", {
    actionType: "AGENT_ACTION",
    entityType: "agents",
    entityId: args.agentId,
    ...(args.companyId ? { companyId: args.companyId } : {}),
    timestamp: args.timestamp,
    metadata: buildAgentActionAuditMetadata({
      agentName: agent?.name,
      tool: args.tool,
      sideEffectLevel: args.sideEffectLevel,
      status: args.status,
      wasApproved: args.wasApproved,
      error: args.error,
    }),
  });
}

export type TerminalRunStatus = "SUCCESS" | "FAILED" | "CANCELLED";

/** The next free step index for a run, so appended steps stay ordered and unique. */
/** Reads only, so a query may ask as well as a mutation. */
export async function getNextStepIndex(
  ctx: { db: Pick<MutationCtx["db"], "query"> },
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
  // A rehearsal's outcome is fabricated — its writes were recorded, not
  // performed — so it must not move the quality counters ranking reads.
  // Guarded here, at the single stamping point, so every terminal path
  // (including stall recovery) is covered.
  const run = await ctx.db.get(runId);
  if (run?.isRehearsal) return;

  const now = Date.now();
  const usageRows = await ctx.db
    .query("agentMemoryUsage")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(AGENT_RUN_MEMORY_USAGE_LIMIT);

  /*
   * Cache the outcome on the memory row itself, one count per run however
   * many times the run consulted the memory. Ranking reads these counters
   * (self-improvement plan, Phase 2); doing the aggregation here keeps the
   * per-message search free of a usage-table fan-out.
   *
   * A run can reach a terminal status twice — recovery marks FAILED, a resume
   * later lands SUCCESS — so the previous outcome (uniform across the run's
   * rows, because this function writes them together) is decremented before
   * the new one is counted.
   */
  const counterKey = {
    SUCCESS: "successCount",
    FAILED: "failureCount",
    CANCELLED: "cancelledCount",
  } as const;

  const rowsByMemory = new Map<Id<"agentMemories">, typeof usageRows>();
  for (const usage of usageRows) {
    const rows = rowsByMemory.get(usage.memoryId) ?? [];
    rows.push(usage);
    rowsByMemory.set(usage.memoryId, rows);
  }

  for (const [memoryId, rows] of rowsByMemory) {
    const previous = rows.find((row) => row.outcome !== "OBSERVED")?.outcome as
      | TerminalRunStatus
      | undefined;
    if (previous === status) continue;

    const memory = await ctx.db.get(memoryId);
    if (!memory) continue;
    const counts = {
      successCount: memory.successCount ?? 0,
      failureCount: memory.failureCount ?? 0,
      cancelledCount: memory.cancelledCount ?? 0,
    };
    if (previous) counts[counterKey[previous]] = Math.max(0, counts[counterKey[previous]] - 1);
    counts[counterKey[status]] += 1;
    await ctx.db.patch(memoryId, { ...counts, lastOutcomeAt: now });
  }

  await Promise.all(usageRows.map((usage) =>
    ctx.db.patch(usage._id, {
      outcome: status,
      updatedAt: now,
    })
  ));
}
