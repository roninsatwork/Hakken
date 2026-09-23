import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Add one step to a run's timeline — what an agent's Observability shows.
 *
 * Anthony, 2026-09-23: "observability is all the steps the agent takes." The
 * model loop writes its own steps; an agent doing fixed work (the DataForSEO
 * Planner and Collector) writes them here, one per thing it did, so its
 * timeline reads like any other agent's. Numbered after the run's last step.
 */
export async function appendRunStep(
  ctx: MutationCtx,
  step: {
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    companyId?: Id<"companies">;
    kind: Doc<"agentRunSteps">["kind"];
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    input?: string;
    output?: string;
    costUsd?: number;
    /** Who was paid for the step, when it was not a model: "dataforseo". */
    providerKey?: string;
    startedAt?: number;
    error?: string;
  },
): Promise<Id<"agentRunSteps">> {
  const last = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", step.runId))
    .order("desc")
    .first();
  const now = Date.now();
  return await ctx.db.insert("agentRunSteps", {
    runId: step.runId,
    agentId: step.agentId,
    ...(step.companyId ? { companyId: step.companyId } : {}),
    stepIndex: (last?.stepIndex ?? -1) + 1,
    kind: step.kind,
    status: step.status,
    ...(step.input !== undefined ? { input: step.input.slice(0, 4_000) } : {}),
    ...(step.output !== undefined ? { output: step.output.slice(0, 4_000) } : {}),
    ...(step.costUsd !== undefined ? { costUsd: step.costUsd } : {}),
    ...(step.providerKey ? { providerKey: step.providerKey } : {}),
    ...(step.error ? { error: step.error } : {}),
    startedAt: step.startedAt ?? now,
    completedAt: now,
  });
}
