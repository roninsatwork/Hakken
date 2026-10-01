"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { failureSummary } from "./roleRuns";
import { newsRoleValidator, type NewsRole } from "./utils/agentRoles";

/**
 * What the News agents do when they are told to run — by the Run button or a
 * schedule (`agentRunStartService.ts`), never found by name: the News
 * Collector reads the sources, the Weekly Digest writes the week's issue and
 * queues it, and the Email Sender sends what is queued (docs/plans/active/
 * knowledge-news-and-digest-plan.md, "The three agents"). On Node, because
 * the two that write call a model, and Vertex signs in only there.
 *
 * Each run takes its turn first — one run of an agent at a time — then does
 * its role's job and finishes with a summary on its timeline. A model call
 * goes through `roleRuns.recordRunModelCall`, which adds its cost to the run,
 * so the agent's own spend limit stops it.
 */

type Job = (ctx: ActionCtx, runId: Id<"agentRuns">) => Promise<string>;

/** Each role's job. Phase 4 built the agents; their work arrives in phases 5, 7 and 9. */
const JOBS: Record<NewsRole, Job> = {
  NEWS_COLLECTOR: async () => "Reading the News sources isn't built yet, so this run read nothing.",
  WEEKLY_DIGEST: async () => "Writing the weekly issue isn't built yet, so nothing was queued.",
  EMAIL_SENDER: async () => "Sending from the outbox isn't built yet, so nothing was sent.",
};

export const runNewsRoleNow = internalAction({
  args: {
    role: newsRoleValidator,
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
      await finish("SUCCESS", turn.ok ? await JOBS[args.role](ctx, args.runId) : turn.message);
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});
