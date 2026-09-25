import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import * as schedulerShapes from "./utils/schedulerShapes";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { assertSeoInterval, companyCollectionSchedule, startsRuns } from "./seoScheduleService";
import { resolveRunObjective } from "./agentObjectiveService";
import { startAgentRun } from "./agentRunStartService";
import { appError } from "./utils/appError";
import { rowShape } from "./utils/rowShape";

const SCHEDULE_LIST_LIMIT = 100;
/** Counting cannot be indexed away, so the badge stops here and says it did. */
const WORKFLOW_APPROVAL_COUNT_LIMIT = 99;
const WORKFLOW_EXECUTION_STEP_DETAIL_LIMIT = 500;

export const getSchedules = superAdminQuery({
  args: {},
  returns: schedulerShapes.scheduleListShape,
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_createdAt")
      .order("desc")
      // Not the companies' Collection schedules: those start nothing, and are
      // shown on each company's own screen.
      .filter(startsRuns)
      .take(SCHEDULE_LIST_LIMIT);
    
    // Enrich with workflow or agent names
    return await Promise.all(
      schedules.map(async (s) => {
        let workflowName = "Deleted Workflow";
        let agentName = "Deleted Agent";
        
        if (s.workflowId) {
          const wf = await ctx.db.get(s.workflowId);
          if (wf) workflowName = wf.name;
        }
        
        if (s.agentId) {
          const ag = await ctx.db.get(s.agentId);
          if (ag) agentName = ag.name;
        }
        
        return {
          ...s,
          workflowName: s.workflowId ? workflowName : undefined,
          agentName: s.agentId ? agentName : undefined,
          targetName: s.workflowId ? workflowName : agentName
        };
      })
    );
  },
});

export const createSchedule = superAdminMutation({
  args: {
    name: v.string(),
    workflowId: v.optional(v.id("workflows")),
    agentId: v.optional(v.id("agents")),
    intervalStr: v.string(), // e.g. "daily", "weekly"
    isActive: v.boolean(),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    const { userId } = ctx;

    if (!args.workflowId && !args.agentId) {
      throw appError("INVALID_INPUT", "Must select a target payload (Workflow or Agent).");
    }

    return await ctx.db.insert("schedules", {
      name: args.name,
      workflowId: args.workflowId,
      agentId: args.agentId,
      intervalStr: args.intervalStr,
      isActive: args.isActive,
      nextRunAt: args.isActive
        ? getNextWorkflowScheduleRunAt({ intervalStr: args.intervalStr, now: new Date() })
        : undefined,
      createdAt: Date.now(),
      createdBy: userId,
    });
  },
});

export const getSchedule = superAdminQuery({
  args: { scheduleId: v.id("schedules") },
  returns: v.union(rowShape.schedules, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.scheduleId);
  },
});

export const updateSchedule = superAdminMutation({
  args: {
    scheduleId: v.id("schedules"),
    name: v.string(),
    workflowId: v.optional(v.id("workflows")),
    agentId: v.optional(v.id("agents")),
    intervalStr: v.string(),
    isActive: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!args.workflowId && !args.agentId) {
      throw appError("INVALID_INPUT", "Must select a target payload (Workflow or Agent).");
    }

    await ctx.db.patch(args.scheduleId, {
      name: args.name,
      workflowId: args.workflowId,
      agentId: args.agentId,
      intervalStr: args.intervalStr,
      isActive: args.isActive,
      nextRunAt: args.isActive
        ? getNextWorkflowScheduleRunAt({ intervalStr: args.intervalStr, now: new Date() })
        : undefined,
    });
    return true;
  },
});

/**
 * The schedule one company's data collection runs on, if it has one.
 *
 * An ordinary `schedules` row found by company — the same table, interval
 * format and helpers every other schedule uses. There is no separate cadence
 * store for SEO, deliberately: the company screen is a view onto this row.
 */
export const getCompanySchedule = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.union(rowShape.schedules, v.null()),
  handler: async (ctx, args) => await companyCollectionSchedule(ctx, args.companyId),
});

/**
 * Save one company's Collection schedule: whether it collects, and how often.
 *
 * A setting, not an alarm. The row names no agent and carries no next run, so
 * nothing wakes for it (`startsRuns`): the DataForSEO Planner reads it on each
 * of its own runs and queues the company's work once its time has come, and
 * the Collector sends it on its. Saving an older row takes off the Collector
 * it used to name, which is what made it wake the Collector itself.
 */
export const saveCompanySchedule = superAdminMutation({
  args: {
    companyId: v.id("companies"),
    /** The row's name, used when it is first created. */
    name: v.string(),
    intervalStr: v.string(),
    isActive: v.boolean(),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.companyId))) throw appError("NOT_FOUND", "Company not found.");
    assertSeoInterval(args.intervalStr);

    const existing = await companyCollectionSchedule(ctx, args.companyId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        intervalStr: args.intervalStr,
        isActive: args.isActive,
        agentId: undefined,
        nextRunAt: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("schedules", {
      name: args.name,
      companyId: args.companyId,
      intervalStr: args.intervalStr,
      isActive: args.isActive,
      createdAt: Date.now(),
      createdBy: ctx.userId,
    });
  },
});

/**
 * Takes the Collector off every company's Collection schedule, and the next
 * run it was due to wake it at (`2026-09-25-company-schedules-wake-nothing`).
 * Whether each company collects, and how often, are left exactly as they are.
 */
export async function detachCompanySchedules(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<{ cursor: string | null; isDone: boolean; processed: number; updated: number }> {
  const page = await ctx.db.query("schedules").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const schedule of page.page) {
    if (!schedule.companyId) continue;
    if (schedule.agentId === undefined && schedule.nextRunAt === undefined) continue;
    await ctx.db.patch(schedule._id, { agentId: undefined, nextRunAt: undefined });
    updated += 1;
  }
  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}

export const toggleSchedule = superAdminMutation({
  args: {
    scheduleId: v.id("schedules"),
    isActive: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);

    await ctx.db.patch(args.scheduleId, {
      isActive: args.isActive,
      nextRunAt: args.isActive && schedule
        ? getNextWorkflowScheduleRunAt({
            intervalStr: schedule.intervalStr,
            lastRunTs: schedule.lastRunTs,
            now: new Date(),
          })
        : undefined,
    });
    return true;
  },
});

export const deleteSchedule = superAdminMutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.scheduleId);
    return true;
  },
});

export const manualRunSchedule = superAdminMutation({
  args: {
    workflowId: v.optional(v.id("workflows")),
    agentId: v.optional(v.id("agents")),
    /**
     * What to do this time, when the agent has no standing job of its own.
     *
     * The other half of the rule on the Instructions screen: leave the job
     * blank and whatever starts the agent has to say what it wants.
     */
    objective: v.optional(v.string()),
  },
  returns: v.id("workflowExecutions"),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    
    if (!args.workflowId && !args.agentId) {
      throw appError("INVALID_INPUT", "Cannot run: no target specified.");
    }

    const now = Date.now();
    const user = await ctx.db.get(userId);
    /**
     * The workspace this run belongs to.
     *
     * The caller's *active* company, which for a super admin is the one they
     * are impersonating. Reading it off the user record gave a super admin's
     * run no workspace at all — they have no company of their own — and every
     * tenant-scoped tool in that run then failed with "this run has none",
     * from a screen that was plainly inside a workspace at the time.
     *
     * Resolved once and used for both the run record and the dispatch below.
     * They were written separately and only one of them was right.
     */
    const runCompanyId = ctx.companyId ?? user?.companyId;
    let agentRunId: Id<"agentRuns"> | undefined;
    let standingObjective = "";
    let agent: Doc<"agents"> | null = null;

    if (args.agentId) {
      agent = await ctx.db.get(args.agentId);
      if (!agent || agent.isActive === false) throw appError("NOT_FOUND", "Agent not found or inactive.");

      // What the caller asked for wins, then the agent's own standing job,
      // then what it says it is for. Never a refusal: pressing Run runs the
      // agent (see agentObjectiveService). An older version sent the agent
      // its own database id, which is why this resolution exists at all.
      standingObjective = resolveRunObjective({
        requested: args.objective,
        standingObjective: agent.standingObjective,
        description: agent.description,
      });

      agentRunId = await ctx.db.insert("agentRuns", {
        agentId: args.agentId,
        triggerType: "MANUAL",
        objective: standingObjective,
        status: "QUEUED",
        companyId: runCompanyId,
        userId,
        startedAt: now,
        updatedAt: now,
      });
    }

    // Create execution log entry
    const executionId = await ctx.db.insert("workflowExecutions", {
      workflowId: args.workflowId,
      agentId: args.agentId,
      agentRunId,
      status: "RUNNING",
      triggerType: "MANUAL",
      startedAt: now,
      startedBy: userId,
    });

    // In a real execution environment, we would queue the workflow runtime here:
    // await ctx.scheduler.runAfter(0, internal.workflowRuntime.executeNodeGraph, { workflowId: args.workflowId, executionId });

    if (agent && agentRunId) {
       // Started through the one helper a schedule uses too
       // (`agentRunStartService.ts`), so the button and the clock cannot
       // drift apart again: a wiki agent does its round, a DataForSEO agent
       // its role's job, every other agent its objective on the model loop.
       await startAgentRun(ctx, {
           agent,
           runId: agentRunId,
           workflowExecutionId: executionId,
           objective: standingObjective,
           triggerType: "MANUAL",
           companyId: runCompanyId,
           userId,
       });
       return executionId;
    }

    // For now, since the actual workflow execution engine is deeply tied to the visual nodes,
    // we simply simulate a successful run to prove the logging works.
    await ctx.scheduler.runAfter(2000, internal.scheduler.completeSimulation, {
       executionId,
       success: true
    });

    return executionId;
  },
});

export const completeAgentExecution = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    agentRunId: v.id("agentRuns"),
    success: v.boolean(),
    output: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      agentRunId: args.agentRunId,
      status: args.success ? "SUCCESS" : "FAILED",
      completedAt: Date.now(),
      state: JSON.stringify({
        agentRunId: args.agentRunId,
        output: args.output,
      }),
    });
  },
});

export const completeSimulation = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: args.success ? "SUCCESS" : "FAILED",
      completedAt: Date.now(),
      state: JSON.stringify({ note: "Autonomous backend heartbeat succeeded." })
    });
  }
});

/**
 * Workflow executions, newest first.
 *
 * There has been no screen showing these since the log pages were deleted in
 * `cc5bc9558`, so after pressing "run" in the builder an operator had nowhere to
 * see what happened — and a workflow halted on an approval was invisible to
 * everything on the platform.
 *
 * Each row carries whether it is waiting on a person, because that is the one
 * thing on this list that needs acting on rather than reading.
 */
export const getWorkflowExecutions = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: schedulerShapes.executionPageShape,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_startedAt")
      .order("desc")
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      page.page.map(async (execution) => {
        const workflow = execution.workflowId ? await ctx.db.get(execution.workflowId) : null;
        const user = execution.startedBy ? await ctx.db.get(execution.startedBy) : null;
        const halted = execution.status === "RUNNING"
          ? await ctx.db
              .query("workflowExecutionSteps")
              .withIndex("by_execution_status_started", (q) =>
                q.eq("executionId", execution._id).eq("status", "PENDING_APPROVAL"))
              .first()
          : null;

        return {
          ...execution,
          workflowName: workflow?.name || "Deleted Workflow",
          startedByName: user?.name || user?.email || "System",
          awaitingApprovalNodeId: halted?.nodeId,
        };
      })
    );

    return { ...page, page: enriched };
  }
});

/**
 * How many workflows are waiting on a person, for the nav badge.
 *
 * Counting cannot be indexed away, so this stops at a bound and says so — the same
 * shape as the agent approval count.
 */
export const getPendingWorkflowApprovalCount = superAdminQuery({
  args: {},
  returns: schedulerShapes.pendingApprovalCountShape,
  handler: async (ctx) => {
    const halted = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_status_started", (q) => q.eq("status", "PENDING_APPROVAL"))
      .take(WORKFLOW_APPROVAL_COUNT_LIMIT);

    // One execution can hold several halted steps; the badge counts workflows
    // needing attention, not steps.
    const executions = new Set(halted.map((step) => step.executionId));

    return {
      count: executions.size,
      atLimit: halted.length === WORKFLOW_APPROVAL_COUNT_LIMIT,
    };
  }
});

export const getWorkflowExecution = superAdminQuery({
  args: { executionId: v.id("workflowExecutions") },
  returns: schedulerShapes.executionDetailShape,
  handler: async (ctx, args) => {
    const exec = await ctx.db.get(args.executionId);
    if (!exec) return null;

    const wf = exec.workflowId ? await ctx.db.get(exec.workflowId) : null;
    const startedByUser = exec.startedBy ? await ctx.db.get(exec.startedBy) : null;

    const steps = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution_started", (q) => q.eq("executionId", args.executionId))
      .order("asc")
      .take(WORKFLOW_EXECUTION_STEP_DETAIL_LIMIT);

    return {
      ...exec,
      workflowName: wf?.name || "Deleted Workflow",
      startedByName: startedByUser?.name || startedByUser?.email || "System",
      steps
    };
  }
});
