"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sendOutbox } from "./emailSenderRun";
import { failureSummary } from "./roleRuns";

/**
 * One run of the Outbox Queue Processing Agent (docs/plans/active/outbox-and-
 * preferences-plan.md, A2), from its schedule or its Run button: its turn —
 * one run at a time — then everything waiting sent, oldest first, and a
 * summary on its timeline. On Node, because a chart an email carries is
 * drawn here (`emailPictureEncoder.ts`).
 */
export const processOutboxNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) => {
      await ctx.runMutation(internal.roleRuns.finishRoleRun, {
        runId: args.runId,
        ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        status,
        summary,
      });
    };
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const turn = await ctx.runMutation(internal.roleRuns.takeRoleTurn, { runId: args.runId });
      await finish("SUCCESS", turn.ok ? await sendOutbox(ctx, args.runId) : turn.message);
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});
