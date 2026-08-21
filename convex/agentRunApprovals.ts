import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  getNextStepIndex,
  recordAgentAction,
  updateMemoryUsageOutcomeForRun,
} from "./agentRunStateService";
import {
  appendRefusedToolCall,
  buildRefusedToolCallKey,
  getRefusedToolCallMessage,
} from "./agentRuntimeService";
import {
  APPROVAL_EXPIRY_CONFIG_KEY,
  DEFAULT_APPROVAL_EXPIRY_HOURS,
  MAX_APPROVAL_EXPIRY_HOURS,
  MIN_APPROVAL_EXPIRY_HOURS,
  getApprovalExpiredMessage,
  isApprovalExpired,
  normalizeApprovalExpiryHoursForUpdate,
  parseApprovalExpiryConfig,
  resolveApprovalExpiryHours,
} from "./approvalExpiryService";
import { AGENT_RUN_DETAIL_LIMIT } from "./agentRuns";

/**
 * The human-in-the-loop approvals subsystem.
 *
 * This lived inside `agentRuns.ts`, where it was eleven hundred lines of a
 * file that also held run listing, run detail, analytics and the internal
 * write path — five jobs in one module, and most of the mutual coupling
 * between `agentRuntime` and `agentRuns`. Everything about a person deciding
 * whether an agent may act now lives here: the pending queue and its badge
 * count, the decide mutation, the expiry window and its sweep, and the
 * settle-and-resume plumbing the runtime calls after a decision.
 */

/** Counting cannot be indexed away, so the badge stops here and says it did. */
const PENDING_APPROVAL_COUNT_LIMIT = 99;
/** One sweep's worth. The cron runs every 15 minutes, so a backlog drains quickly. */
const APPROVAL_EXPIRY_SWEEP_LIMIT = 100;

const approvalStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("CANCELLED")
);

function getApprovalFinalOutput(status: "REJECTED" | "CANCELLED", reason?: string) {
  if (status === "REJECTED") {
    return reason ? `Agent approval rejected: ${reason}` : "Agent approval rejected.";
  }

  return reason ? `Agent approval cancelled: ${reason}` : "Agent approval cancelled.";
}

/**
 * The approval queue, super-admin only.
 *
 * This used to be an `adminQuery` with a company-scoped branch, so a company
 * ADMIN was authorised over the public API. The nav has always hidden the page
 * from them, which made it a live permission with no screen behind it — the same
 * shape of fault as the workflow resume hole. Approvals are an operation run on a
 * client's behalf, so the API now says that.
 *
 * The consequence is deliberate and worth knowing: a client's own admin cannot
 * unstick their own agent. That is why the count badge and the expiry sweep are
 * not optional extras.
 */
export const getPendingApprovals = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    // Two indexes, one for each mode. Filtering the loaded page in the browser
    // instead would search 15 rows of an unknown number and report "no matches"
    // with matches still unpaged.
    const approvalsPage = searchTerm
      ? await ctx.db
          .query("agentRunApprovals")
          .withSearchIndex("search_approval", (q) =>
            q.search("searchText", searchTerm).eq("status", "PENDING"))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("agentRunApprovals")
          .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
          .order("desc")
          .paginate(args.paginationOpts);

    const page = await Promise.all(approvalsPage.page.map(async (approval) => {
      const [run, toolCall, agent] = await Promise.all([
        ctx.db.get(approval.runId),
        approval.toolCallId ? ctx.db.get(approval.toolCallId) : null,
        ctx.db.get(approval.agentId),
      ]);

      return {
        approval,
        run,
        toolCall,
        agent,
      };
    }));

    return {
      ...approvalsPage,
      page,
    };
  },
});

/**
 * How many runs are waiting on a person, for the nav badge.
 *
 * Counts every pending approval rather than only the stale ones. The 30-minute
 * `PENDING_APPROVAL_THRESHOLD_MINUTES` in `systemHealth` is right for an alert
 * digest and wrong for the thing telling you a run is waiting: for the first half
 * hour that signal reads zero, which is exactly when someone could still act on it.
 */
export const getPendingApprovalCount = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
      .take(PENDING_APPROVAL_COUNT_LIMIT);

    return {
      count: pending.length,
      // So the badge can read "99+" rather than claiming a precise number it did
      // not finish counting.
      atLimit: pending.length === PENDING_APPROVAL_COUNT_LIMIT,
    };
  },
});

/** Super-admin only, for the same reason as `getPendingApprovals` above. */
export const decideApproval = superAdminMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    decision: v.union(v.literal("APPROVED"), v.literal("REJECTED"), v.literal("CANCELLED")),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    // Covers EXPIRED as well, so a stale browser tab cannot approve something the
    // platform has already closed and whose run has been cancelled underneath it.
    if (approval.status === "EXPIRED") {
      throw new Error("This request expired before it was answered, and its run has stopped.");
    }
    if (approval.status !== "PENDING") throw new Error("Approval has already been reviewed");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const now = Date.now();
    await ctx.db.patch(args.approvalId, {
      status: args.decision,
      reviewedBy: userId,
      reviewedAt: now,
      ...(args.decisionReason !== undefined ? { decisionReason: args.decisionReason } : {}),
    });

    // Approving a tool call is exactly the event an audit log exists for, and this
    // wrote none. `cancelRun` next door has always written one. Recorded before the
    // branch below, so an approval, a refusal and a cancellation are all traceable
    // through one path rather than three.
    const decidedToolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: `AGENT_APPROVAL_${args.decision}`,
      entityType: "agentRunApprovals",
      entityId: args.approvalId,
      ...(run.companyId ? { companyId: run.companyId } : {}),
      metadata: JSON.stringify({
        runId: approval.runId,
        agentId: approval.agentId,
        tool: decidedToolCall?.normalizedToolName,
        // The thing a reader of the log most wants to know: was this a lookup or a
        // deletion.
        sideEffectLevel: decidedToolCall?.sideEffectLevel,
        reason: args.decisionReason,
      }),
      timestamp: now,
    });

    if (args.decision === "APPROVED") {
      if (approval.toolCallId) {
        await ctx.db.patch(approval.toolCallId, {
          status: "PENDING",
          confirmationGrantedAt: now,
        });
      }

      // Only back to RUNNING once nothing else in this run is waiting. A model
      // turn can request several tools, so approving one of three leaves the run
      // parked — and a run that reports RUNNING while it sits waiting on a person
      // is exactly the state the stalled-run sweeper is meant to catch. The
      // approved tool still executes now; it is the run's status that waits.
      const stillPending = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      if (stillPending.length === 0) {
        await ctx.db.patch(approval.runId, {
          status: "RUNNING",
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(approval.runId, { updatedAt: now });
      }

      await ctx.scheduler.runAfter(0, internal.agentRuntime.resumeApprovedToolCall, {
        approvalId: args.approvalId,
      });
      return true;
    }

    // A rejection tells the agent; it no longer kills the run.
    //
    // Rejecting used to set the run FAILED with the model told nothing, so from
    // the agent's side the conversation stopped mid-thought and an objective that
    // was often nearly done was thrown away. A reviewer who means "not that way,
    // but do carry on" now has a button for it. Stopping a run outright is
    // `cancelRun`, and CANCELLED here keeps its old meaning, so the three
    // decisions are finally three different things.
    if (args.decision === "REJECTED") {
      const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
      const refusalMessage = getRefusedToolCallMessage(
        toolCall?.normalizedToolName ?? "this tool",
        args.decisionReason,
      );
      const refusalResult = JSON.stringify({ status: "error", error: refusalMessage });

      if (approval.toolCallId) {
        await ctx.db.patch(approval.toolCallId, {
          status: "DENIED",
          resultJson: refusalResult,
          completedAt: now,
          error: refusalMessage,
        });
      }

      const refusalStepIndex = await getNextStepIndex(ctx, approval.runId);
      await ctx.db.insert("agentRunSteps", {
        runId: approval.runId,
        agentId: approval.agentId,
        companyId: approval.companyId,
        stepIndex: refusalStepIndex,
        kind: "TOOL_RESULT",
        status: "FAILED",
        output: refusalResult,
        startedAt: now,
        completedAt: now,
        error: refusalMessage,
      });

      // Remember what was refused, so the model cannot ask again for the same
      // thing and put the same decision back in front of the reviewer.
      if (toolCall) {
        await ctx.db.patch(approval.runId, {
          refusedToolCallsJson: appendRefusedToolCall(
            run.refusedToolCallsJson,
            buildRefusedToolCallKey(toolCall.normalizedToolName, toolCall.argumentsJson),
          ),
          updatedAt: now,
        });
      }

      // Same settle-or-wait rule as an approval: the model asked for this turn's
      // calls together and has to be answered together, so the run only moves
      // when every one of them has an answer.
      const stillPending = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      if (stillPending.length === 0) {
        await ctx.db.patch(approval.runId, { status: "RUNNING", updatedAt: now });
      }

      await ctx.scheduler.runAfter(0, internal.agentRuntime.resumeAfterRefusedToolCall, {
        approvalId: args.approvalId,
      });

      return true;
    }

    const finalOutput = getApprovalFinalOutput(args.decision, args.decisionReason);
    const runStatus = "CANCELLED" as const;
    const toolStatus = "CANCELLED" as const;
    const nextStepIndex = await getNextStepIndex(ctx, approval.runId);

    if (approval.toolCallId) {
      await ctx.db.patch(approval.toolCallId, {
        status: toolStatus,
        completedAt: now,
        error: finalOutput,
      });
    }

    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: nextStepIndex,
      kind: "FINAL",
      status: "SKIPPED",
      output: finalOutput,
      startedAt: now,
      completedAt: now,
    });

    await ctx.db.patch(approval.runId, {
      status: runStatus,
      updatedAt: now,
      completedAt: now,
      cancelledAt: now,
      finalOutput,
    });
    await updateMemoryUsageOutcomeForRun(ctx, approval.runId, runStatus);

    // The run is over, so its parked position is not something to resume from.
    // A rejected run's checkpoint sits in AWAITING_APPROVAL, which the stalled-
    // run sweeper deliberately ignores, so nothing else would ever remove it.
    const checkpoint = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", approval.runId))
      .first();
    if (checkpoint) await ctx.db.delete(checkpoint._id);

    return true;
  },
});

export const insertApprovalInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    stepId: v.optional(v.id("agentRunSteps")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    requestedBy: v.optional(v.id("users")),
    reviewedBy: v.optional(v.id("users")),
    status: approvalStatusValidator,
    message: v.optional(v.string()),
    previewJson: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Resolved here rather than on read: the queue is searched far more often
    // than it is written, and a search index needs the text on the row.
    const [agent, toolCall] = await Promise.all([
      ctx.db.get(args.agentId),
      args.toolCallId ? ctx.db.get(args.toolCallId) : null,
    ]);
    const searchText = [agent?.name, toolCall?.normalizedToolName, toolCall?.handlerMapping]
      .filter((part): part is string => Boolean(part))
      .join(" ");

    return await ctx.db.insert("agentRunApprovals", {
      ...args,
      ...(searchText.length > 0 ? { searchText } : {}),
      requestedAt: now,
      ...(args.status !== "PENDING" ? { reviewedAt: now } : {}),
    });
  },
});

export const getApprovalResumeContextInternal = internalQuery({
  args: {
    approvalId: v.id("agentRunApprovals"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) return null;

    const [run, toolCall, agent] = await Promise.all([
      ctx.db.get(approval.runId),
      approval.toolCallId ? ctx.db.get(approval.toolCallId) : null,
      ctx.db.get(approval.agentId),
    ]);

    return {
      approval,
      run,
      toolCall,
      agent,
    };
  },
});

/**
 * Hand an approved tool's result back to the model and restart the loop.
 *
 * Human-in-the-loop used to end here: the tool ran, a fixed sentence was posted
 * ("Approved tool call completed"), and the run was marked finished. The model
 * never saw the result, so an agent that asked permission to look something up
 * could not then use what it found — approval was a one-shot side-effect
 * executor rather than a pause in the agent's reasoning.
 *
 * The transcript comes in already extended with the call and its result, so all
 * that remains is to record the outcome, put the run back to RUNNING and hand it
 * to the scheduler. Returns false when there is no checkpoint to resume into, in
 * which case the caller falls back to concluding the run.
 */
/**
 * Record one approved call's outcome, and say whether the batch is settled.
 *
 * A single model turn can request several tools, so a parked run may hold several
 * approvals. They are decided one at a time, but the model must be answered once,
 * with every result of that turn in the order it asked for them. So this records
 * the outcome and then answers the only question the caller needs: is anything in
 * this run still waiting on a person?
 *
 * While something is, the run stays parked and nothing is appended. When nothing
 * is, the whole batch comes back — including the calls that ran without needing
 * approval, whose results have been sitting on their rows since the run parked.
 */
export const recordApprovedToolResultInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    resultJson: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const now = Date.now();
    const resultStepIndex = await getNextStepIndex(ctx, approval.runId);
    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: resultStepIndex,
      kind: "TOOL_RESULT",
      status: args.status,
      output: args.resultJson,
      startedAt: now,
      completedAt: now,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });

    if (approval.toolCallId) {
      await ctx.db.patch(approval.toolCallId, {
        status: args.status,
        resultJson: args.resultJson,
        completedAt: now,
        ...(args.error !== undefined ? { error: args.error } : {}),
      });

      // The other settlement point. This call was held back for a person, who
      // said yes — so the trail carries the decision and, here, what the agent
      // then actually did with it.
      const approvedCall = await ctx.db.get(approval.toolCallId);
      if (approvedCall) {
        await recordAgentAction(ctx, {
          agentId: approval.agentId,
          companyId: approval.companyId,
          runId: approval.runId,
          tool: approvedCall.normalizedToolName,
          sideEffectLevel: approvedCall.sideEffectLevel,
          status: args.status,
          error: args.error,
          wasApproved: true,
          timestamp: now,
        });
      }
    }

    const stillPending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .take(AGENT_RUN_DETAIL_LIMIT);
    if (stillPending.length > 0) {
      return { settled: false as const, batchCalls: [], stepIndex: resultStepIndex };
    }

    const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    // A row written before `turnIndex` existed has none. Answering with just this
    // call is the old behaviour, which is the right fallback for an old row.
    const batch = toolCall?.turnIndex === undefined
      ? (toolCall ? [toolCall] : [])
      : await ctx.db
          .query("agentToolCalls")
          .withIndex("by_run_turn", (q) =>
            q.eq("runId", approval.runId).eq("turnIndex", toolCall.turnIndex))
          .take(AGENT_RUN_DETAIL_LIMIT);

    return {
      settled: true as const,
      stepIndex: resultStepIndex,
      batchCalls: batch.map((call) => ({
        name: call.normalizedToolName,
        argumentsJson: call.argumentsJson,
        resultJson: call.resultJson,
        thoughtSignature: call.thoughtSignature,
      })),
    };
  },
});

export const getApprovalExpiryConfig = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();

    return {
      ...parseApprovalExpiryConfig(config?.value),
      defaultHours: DEFAULT_APPROVAL_EXPIRY_HOURS,
      minHours: MIN_APPROVAL_EXPIRY_HOURS,
      maxHours: MAX_APPROVAL_EXPIRY_HOURS,
    };
  },
});

export const updateApprovalExpiryConfig = superAdminMutation({
  args: {
    expiryHours: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const expiryHours = normalizeApprovalExpiryHoursForUpdate(args.expiryHours);
    const now = Date.now();
    const value = JSON.stringify({ expiryHours });

    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: now, updatedBy: userId });
    } else {
      await ctx.db.insert("systemConfig", {
        key: APPROVAL_EXPIRY_CONFIG_KEY,
        value,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      entityType: "systemConfig",
      entityId: APPROVAL_EXPIRY_CONFIG_KEY,
      metadata: JSON.stringify({ expiryHours }),
      timestamp: now,
    });

    return expiryHours;
  },
});

/**
 * Give up on approvals nobody answered.
 *
 * Only ever cancels. An unattended yes to a deletion is the one outcome worse than
 * a stuck run, and unlike a rejection nobody made a judgement here — so the run is
 * stopped rather than the model being told it was refused, which would put a
 * decision in the transcript that no person took.
 *
 * The whole batch goes together. A model turn's calls were requested together and
 * leaving siblings pending would park the run again with nothing able to settle it.
 */
export const expireStalePendingApprovals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const platformConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();
    const platformExpiryHours = parseApprovalExpiryConfig(platformConfig?.value).expiryHours;

    const pending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
      .take(APPROVAL_EXPIRY_SWEEP_LIMIT);

    let expiredRuns = 0;
    const handledRuns = new Set<string>();

    for (const approval of pending) {
      if (handledRuns.has(approval.runId)) continue;

      const agent = await ctx.db.get(approval.agentId);
      const expiryHours = resolveApprovalExpiryHours({
        agentExpiryHours: agent?.approvalExpiryHours,
        platformExpiryHours,
      });
      if (!isApprovalExpired({ requestedAt: approval.requestedAt, now, expiryHours })) continue;

      const run = await ctx.db.get(approval.runId);
      // A run that has already reached a terminal state has been dealt with by
      // something else — a cancellation, most likely. Leave its rows alone.
      if (!run || run.status !== "PENDING_APPROVAL") continue;

      handledRuns.add(approval.runId);
      expiredRuns += 1;
      const message = getApprovalExpiredMessage(expiryHours);

      const runApprovals = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      for (const stale of runApprovals) {
        await ctx.db.patch(stale._id, {
          status: "EXPIRED",
          reviewedAt: now,
          decisionReason: message,
        });
        if (stale.toolCallId) {
          await ctx.db.patch(stale.toolCallId, {
            status: "CANCELLED",
            completedAt: now,
            error: message,
          });
        }
      }

      const stepIndex = await getNextStepIndex(ctx, approval.runId);
      await ctx.db.insert("agentRunSteps", {
        runId: approval.runId,
        agentId: approval.agentId,
        companyId: approval.companyId,
        stepIndex,
        kind: "FINAL",
        status: "SKIPPED",
        output: message,
        startedAt: now,
        completedAt: now,
      });

      await ctx.db.patch(approval.runId, {
        status: "CANCELLED",
        updatedAt: now,
        completedAt: now,
        cancelledAt: now,
        finalOutput: message,
      });
      await updateMemoryUsageOutcomeForRun(ctx, approval.runId, "CANCELLED");

      // The parked position is not something to resume from, and the sweeper that
      // clears stale checkpoints deliberately ignores AWAITING_APPROVAL ones.
      const checkpoint = await ctx.db
        .query("agentRunCheckpoints")
        .withIndex("by_run", (q) => q.eq("runId", approval.runId))
        .first();
      if (checkpoint) await ctx.db.delete(checkpoint._id);

      // Deliberately no audit row. `auditLogs.actorId` is required and names the
      // admin who did a thing; nobody did this one, and inventing an actor to
      // satisfy the column would put a person's name against a decision they never
      // took. Widening a table every screen reads, for a nicety, is the worse
      // trade. The expiry is already traceable without it: the approval carries
      // EXPIRED and the reason, the run carries a FINAL step and CANCELLED, and the
      // conversation gets the sentence below.

      // Nobody chose this, so the conversation gets a sentence rather than simply
      // going dead.
      if (run.threadId) {
        await ctx.scheduler.runAfter(0, internal.chat.saveAssistantMessage, {
          threadId: run.threadId,
          content: message,
        });
      }
    }

    return { examined: pending.length, expiredRuns };
  },
});

/**
 * The same settle-or-wait answer as `recordApprovedToolResultInternal`, without
 * writing anything.
 *
 * A refusal has already been recorded by `decideApproval`, so the resume only
 * needs to know whether the batch is complete and, if it is, what the whole turn
 * looked like.
 */
export const getSettlementAfterDecisionInternal = internalQuery({
  args: { approvalId: v.id("agentRunApprovals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) return null;

    const stillPending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .take(AGENT_RUN_DETAIL_LIMIT);
    const stepIndex = await getNextStepIndex(ctx, approval.runId);
    if (stillPending.length > 0) {
      return { settled: false as const, batchCalls: [], stepIndex };
    }

    const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    const batch = toolCall?.turnIndex === undefined
      ? (toolCall ? [toolCall] : [])
      : await ctx.db
          .query("agentToolCalls")
          .withIndex("by_run_turn", (q) =>
            q.eq("runId", approval.runId).eq("turnIndex", toolCall.turnIndex))
          .take(AGENT_RUN_DETAIL_LIMIT);

    return {
      settled: true as const,
      stepIndex,
      batchCalls: batch.map((call) => ({
        name: call.normalizedToolName,
        argumentsJson: call.argumentsJson,
        resultJson: call.resultJson,
        thoughtSignature: call.thoughtSignature,
      })),
    };
  },
});

export const continueRunAfterApprovalInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    transcriptJson: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const checkpoint = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", approval.runId))
      .first();
    if (!checkpoint || checkpoint.status !== "AWAITING_APPROVAL") return false;

    const now = Date.now();
    // Back to RUNNING, not to a terminal status: the objective is not finished,
    // it was waiting.
    await ctx.db.patch(approval.runId, {
      status: "RUNNING",
      updatedAt: now,
    });

    await ctx.db.patch(checkpoint._id, {
      status: "ACTIVE",
      transcriptJson: args.transcriptJson,
      stepIndex: args.stepIndex,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.continueAgentObjective, {
      runId: approval.runId,
    });

    return true;
  },
});

/**
 * Conclude a run that cannot be resumed into a conversation.
 *
 * A triggered run with no chat thread, or one whose conversation grew too large to
 * checkpoint. The tool ran and its outcome is already recorded by
 * `recordApprovedToolResultInternal`; all that is left is to close the run.
 */
export const completeApprovalResumeInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    finalOutput: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const now = Date.now();
    const finalStepIndex = await getNextStepIndex(ctx, approval.runId);
    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: finalStepIndex,
      kind: "FINAL",
      status: args.status,
      output: args.finalOutput,
      startedAt: now,
      completedAt: now,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });

    await ctx.db.patch(approval.runId, {
      status: args.status,
      updatedAt: now,
      completedAt: now,
      finalOutput: args.finalOutput,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });
    await updateMemoryUsageOutcomeForRun(ctx, approval.runId, args.status);

    return {
      runId: approval.runId,
      threadId: run.threadId,
      finalOutput: args.finalOutput,
    };
  },
});
