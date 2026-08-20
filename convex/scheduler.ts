import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { resolveRunObjective } from "./agentObjectiveService";
import { WIKI_STAFF } from "./wikiStaff";

const SCHEDULE_LIST_LIMIT = 100;
/** Counting cannot be indexed away, so the badge stops here and says it did. */
const WORKFLOW_APPROVAL_COUNT_LIMIT = 99;
const WORKFLOW_EXECUTION_STEP_DETAIL_LIMIT = 500;

export const getSchedules = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_createdAt")
      .order("desc")
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
  handler: async (ctx, args) => {
    const { userId } = ctx;
    
    if (!args.workflowId && !args.agentId) {
      throw new Error("Must select a target payload (Workflow or Agent).");
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
  handler: async (ctx, args) => {
    if (!args.workflowId && !args.agentId) {
      throw new Error("Must select a target payload (Workflow or Agent).");
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

export const toggleSchedule = superAdminMutation({
  args: {
    scheduleId: v.id("schedules"),
    isActive: v.boolean(),
  },
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
  handler: async (ctx, args) => {
    const { userId } = ctx;
    
    if (!args.workflowId && !args.agentId) {
      throw new Error("Cannot run: no target specified.");
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
    /** Set when the agent is one of the wiki staff, whose Run is a sweep. */
    let wikiStaffKey: string | undefined;

    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.isActive === false) throw new Error("Agent not found or inactive.");

      // What the caller asked for wins, then the agent's own standing job,
      // then what it says it is for. Never a refusal: pressing Run runs the
      // agent (see agentObjectiveService). An older version sent the agent
      // its own database id, which is why this resolution exists at all.
      standingObjective = resolveRunObjective({
        requested: args.objective,
        standingObjective: agent.standingObjective,
        description: agent.description,
      });
      wikiStaffKey = WIKI_STAFF.some((member) => member.systemKey === agent.systemKey)
        ? agent.systemKey
        : undefined;

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

    if (args.agentId && wikiStaffKey) {
       /**
        * A wiki agent's Run does its round, not a model call about its
        * round. The staff's work is a sweep over every wiki on the platform
        * — see wikiStaffRunActions — and putting them on the ordinary agent
        * loop produced a paragraph of text and changed nothing, which is why
        * they read as agents that never work.
        */
       await ctx.scheduler.runAfter(0, internal.wikiStaffRunActions.runStaffNow, {
           systemKey: wikiStaffKey,
           runId: agentRunId as Id<"agentRuns">,
           workflowExecutionId: executionId,
       });
       return executionId;
    }

    if (args.agentId) {
       await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
           agentId: args.agentId,
           // Set above, in the same `if (args.agentId)` branch that refuses
           // to start an agent without one.
           objective: standingObjective,
           triggerType: "MANUAL",
           runId: agentRunId,
           workflowExecutionId: executionId,
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
