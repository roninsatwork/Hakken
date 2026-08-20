"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Pressing Run on a wiki agent does that agent's actual job.
 *
 * The wiki staff are not ordinary agents. Their work is not a model call
 * with a prompt — it is a sweep: read the unread documents, connect the
 * unconnected pages, re-check the aging ones. Starting one on the generic
 * agent loop, which is what the Run button did, produced a model reply about
 * the work and filed nothing. From the screen that was indistinguishable
 * from an agent that does not run at all, which is exactly what it was
 * reported as (Anthony, 2026-08-20: *"the local agents still fail to run"*).
 *
 * Every sweep below walks every company on the platform, one wiki at a time
 * — the wikis are separate and independent, and one Run covers all of them.
 *
 * Two of the staff have no sweep because they are called by events rather
 * than on a round: the Reviewer runs at ingest, the Filing Clerk after an
 * answer. They say so plainly instead of pretending to work.
 */

type StaffJob = {
  /** Runs the round over every wiki, and says what it covered. */
  run: (ctx: ActionCtx) => Promise<string>;
};

const EVENT_DRIVEN = (when: string): StaffJob => ({
  run: async () => `Nothing to run on demand — this one is called ${when}.`,
});

const STAFF_JOBS: Record<string, StaffJob> = {
  WIKI_DISTILLER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(internal.wikiDistillActions.distilSweep, {});
      return `Started the reading round across ${companies} ${companies === 1 ? "wiki" : "wikis"}.`;
    },
  },
  WIKI_LINKER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(internal.wikiTendingActions.linkDispatcher, {});
      return `Started the linking round across ${companies} ${companies === 1 ? "wiki" : "wikis"}.`;
    },
  },
  WIKI_TIDIER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(internal.wikiTendingActions.tendDispatcher, {});
      return `Started the tending round; ${companies} ${companies === 1 ? "wiki needs" : "wikis need"} tidying.`;
    },
  },
  WIKI_FRESHNESS_CHECKER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(internal.wikiFreshnessActions.freshnessSweep, {});
      return `Started the freshness round across ${companies} ${companies === 1 ? "wiki" : "wikis"}.`;
    },
  },
  WIKI_CONTRADICTION_FINDER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(
        internal.wikiContradictionActions.contradictionSweep,
        {}
      );
      return `Started the contradiction round across ${companies} ${companies === 1 ? "wiki" : "wikis"}.`;
    },
  },
  WIKI_EXAMINER: {
    run: async (ctx) => {
      const { companies } = await ctx.runAction(internal.wikiExamGrowthActions.examGrowthSweep, {});
      return `Started the exam round across ${companies} ${companies === 1 ? "wiki" : "wikis"}.`;
    },
  },
  WIKI_REVIEWER: EVENT_DRIVEN("at ingest, for material a person marks as sensitive"),
  WIKI_FILING_CLERK: EVENT_DRIVEN("after an answer that drew on more than one wiki page"),
};

/** Whether this agent is one of the staff, so Run should do its round. */
export function isWikiStaffKey(systemKey: string | undefined | null): boolean {
  return Boolean(systemKey && systemKey in STAFF_JOBS);
}

export const runStaffNow = internalAction({
  args: {
    systemKey: v.string(),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  handler: async (ctx, args): Promise<void> => {
    const job = STAFF_JOBS[args.systemKey];
    const startedAt = Date.now();
    if (!job) {
      await finish(ctx, args, "FAILED", `No round is defined for ${args.systemKey}.`, startedAt);
      return;
    }
    try {
      const summary = await job.run(ctx);
      await finish(ctx, args, "SUCCESS", summary, startedAt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await finish(
        ctx,
        args,
        "FAILED",
        message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.",
        startedAt
      );
    }
  },
});

async function finish(
  ctx: ActionCtx,
  args: { runId: Id<"agentRuns">; workflowExecutionId?: Id<"workflowExecutions"> },
  status: "SUCCESS" | "FAILED",
  summary: string,
  startedAt: number
): Promise<void> {
  await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, {
    runId: args.runId,
    ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
    status,
    summary,
    startedAt,
  });
}
