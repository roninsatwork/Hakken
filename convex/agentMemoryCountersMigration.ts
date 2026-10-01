import type { MutationCtx } from "./_generated/server";

/**
 * Rebuilds the outcome counters on `agentMemories` from `agentMemoryUsage`
 * (self-improvement plan, Phase 2). Memories written before the counters
 * existed would otherwise rank as if they had no history, when the history
 * has been in the usage table all along. One count per run, matching the
 * live stamping in `agentRunStateService`.
 *
 * DO NOT RE-RUN once the agentRunHistory retention pipeline has fired on
 * a deployment: that pipeline deletes old `agentMemoryUsage` rows, so a
 * rebuild from what remains would silently shrink every memory's counters
 * (retention-and-purge-plan, Phase 2.3). The cached counters are the
 * authoritative record from then on.
 */
export async function rebuildMemoryOutcomeCounters(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db.query("agentMemories").paginate({ cursor, numItems: batchSize });
  let updated = 0;

  for (const memory of page.page) {
    const usages = await ctx.db
      .query("agentMemoryUsage")
      .withIndex("by_memory_used", (q) => q.eq("memoryId", memory._id))
      .order("desc")
      .take(1000);

    const outcomeByRun = new Map<string, "SUCCESS" | "FAILED" | "CANCELLED">();
    let lastOutcomeAt: number | undefined;
    for (const usage of usages) {
      if (usage.outcome === "OBSERVED") continue;
      outcomeByRun.set(usage.runId, usage.outcome);
      if (lastOutcomeAt === undefined || usage.updatedAt > lastOutcomeAt) {
        lastOutcomeAt = usage.updatedAt;
      }
    }

    const counts = { successCount: 0, failureCount: 0, cancelledCount: 0 };
    for (const outcome of outcomeByRun.values()) {
      if (outcome === "SUCCESS") counts.successCount += 1;
      else if (outcome === "FAILED") counts.failureCount += 1;
      else counts.cancelledCount += 1;
    }

    // Idempotent: skip rows already carrying the rebuilt truth.
    if (
      (memory.successCount ?? 0) === counts.successCount &&
      (memory.failureCount ?? 0) === counts.failureCount &&
      (memory.cancelledCount ?? 0) === counts.cancelledCount
    ) continue;

    await ctx.db.patch(memory._id, {
      ...counts,
      ...(lastOutcomeAt !== undefined ? { lastOutcomeAt } : {}),
    });
    updated += 1;
  }

  return {
    cursor: page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}
