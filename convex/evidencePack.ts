import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { governanceAction } from "./tenantFunctions";
import {
  isWithin,
  narrateRun,
  summarisePack,
  type EvidencePack,
  type EvidencePeriod,
  type NarratedRun,
  type ProducedEvidencePack,
  type RecordedDecision,
  type RunOutcome,
  type ToolAction,
} from "./evidencePackService";
import {
  sortRegister,
  toAssistantEntry,
  toWidgetEntry,
  toWorkflowEntry,
  type AiSystemEntry,
} from "./governanceRegisterService";
import { appError } from "./utils/appError";

/**
 * The evidence pack: everything an auditor asks for, for a chosen period.
 *
 * This is the step that turns the governance section from a set of screens into
 * a deliverable. Until it existed the platform recorded everything and none of
 * it could leave, which meant the claim that Sonae generates a customer's
 * evidence automatically failed at the last step.
 *
 * Produced by a `governanceAction` rather than a query for one reason: an
 * auditor has to be able to run it — an export they cannot take is not evidence
 * — and taking it has to be recorded. The auditor writes nothing; the platform
 * records that they exported, which is a different thing.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/**
 * What this reads, and what it will not.
 *
 * The first version scanned two thousand runs and up to two hundred tool calls
 * each, and against real data it exceeded Convex's read limit before producing
 * anything. A pack that fails is worth less than a pack that covers the most
 * recent activity and says where it stopped.
 *
 * So it is bounded, and the bound is reported in the document. A pack that
 * quietly omitted half a period would be worse than one that admits its edge —
 * the reader would have no way to know.
 */
const SYSTEM_SCAN_LIMIT = 500;
const RUN_SCAN_LIMIT = 400;
const NARRATED_RUN_LIMIT = 100;
const TOOL_CALLS_PER_RUN = 40;

function ownerNameOf(user: Doc<"users"> | null): string {
  return user ? (user.name ?? user.email ?? "").trim() : "";
}

export const gather = internalQuery({
  args: {
    from: v.number(),
    to: v.number(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<EvidencePack> => {
    const period: EvidencePeriod = { from: args.from, to: args.to };
    const scopeCompanyId = args.companyId;

    /** Their own records plus the platform-wide ones, exactly as the register reads it. */
    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;

    const [agents, widgets, workflows, rules, runs, approvals] = await Promise.all([
      ctx.db.query("agents").take(SYSTEM_SCAN_LIMIT),
      ctx.db.query("widgets").take(SYSTEM_SCAN_LIMIT),
      ctx.db.query("workflows").take(SYSTEM_SCAN_LIMIT),
      ctx.db.query("aiRules").take(SYSTEM_SCAN_LIMIT),
      ctx.db.query("agentRuns").order("desc").take(RUN_SCAN_LIMIT),
      ctx.db.query("agentRunApprovals").withIndex("by_status_requested").take(SYSTEM_SCAN_LIMIT),
    ]);

    const userCache = new Map<string, Doc<"users"> | null>();
    const resolveName = async (userId: Id<"users"> | undefined) => {
      if (!userId) return "";
      if (!userCache.has(userId)) userCache.set(userId, await ctx.db.get(userId));
      return ownerNameOf(userCache.get(userId) ?? null);
    };

    // --- Every AI system, exactly as the register describes it -------------
    const entries: AiSystemEntry[] = [];
    const agentById = new Map(agents.map((agent) => [agent._id as string, agent]));

    for (const agent of agents.filter(withinScope)) {
      entries.push(toAssistantEntry(agent, await resolveName(agent.ownerId), agent.updatedAt));
    }
    for (const widget of widgets.filter(withinScope)) {
      const agent = widget.agentId ? (agentById.get(widget.agentId) ?? null) : null;
      entries.push(toWidgetEntry(widget, await resolveName(widget.createdBy), agent));
    }
    for (const workflow of workflows.filter(withinScope)) {
      entries.push(toWorkflowEntry(workflow, await resolveName(workflow.createdBy)));
    }

    // --- What the AI actually did, in the period ---------------------------
    const matchingRuns = runs
      .filter(withinScope)
      .filter((run) => isWithin(period, run.startedAt));

    // Newest first, so a truncated pack holds the most recent activity rather
    // than an arbitrary slice of it.
    const runsInPeriod = matchingRuns.slice(0, NARRATED_RUN_LIMIT);
    const runsOmitted = matchingRuns.length - runsInPeriod.length;

    const approvalByRun = new Map(approvals.map((approval) => [approval.runId as string, approval]));

    const narrated: NarratedRun[] = [];
    for (const run of runsInPeriod) {
      const toolCalls = await ctx.db
        .query("agentToolCalls")
        .withIndex("by_run_started", (q) => q.eq("runId", run._id))
        .take(TOOL_CALLS_PER_RUN);

      const actions: ToolAction[] = toolCalls.map((call) => ({
        normalizedToolName: call.normalizedToolName,
        sideEffectLevel: call.sideEffectLevel,
        status: call.status,
        // Refused, not merely failed. `DENIED` and `APPROVAL_REQUIRED` are the
        // platform stopping something on purpose, and `NOT_IMPLEMENTED` is it
        // declining to act — those are the ones an auditor is looking for. A
        // run that simply errored is reported through its outcome instead, so
        // a crash is not dressed up as a refusal.
        blocked:
          call.status === "DENIED"
          || call.status === "APPROVAL_REQUIRED"
          || call.status === "NOT_IMPLEMENTED",
      }));

      const approval = approvalByRun.get(run._id as string);
      const agent = agentById.get(run.agentId as string);

      narrated.push({
        id: run._id as string,
        at: run.startedAt,
        agentName: agent?.name ?? "An assistant that has since been removed",
        lines: narrateRun({
          agentName: agent?.name ?? "An assistant that has since been removed",
          objective: run.objective,
          trigger: run.triggerType,
          status: run.status as RunOutcome,
          actions,
          approvedBy:
            approval?.status === "APPROVED" ? await resolveName(approval.reviewedBy) : undefined,
          approvalReason: approval?.decisionReason,
        }),
        blockedCount: actions.filter((action) => action.blocked).length,
      });
    }

    // --- Every human decision in the period --------------------------------
    const decisions: RecordedDecision[] = [];
    for (const approval of approvals.filter(withinScope)) {
      if (!isWithin(period, approval.reviewedAt ?? approval.requestedAt)) continue;
      const agent = agentById.get(approval.agentId as string);
      decisions.push({
        id: approval._id as string,
        at: approval.reviewedAt ?? approval.requestedAt,
        agentName: agent?.name ?? "An assistant that has since been removed",
        status: approval.status,
        decidedBy: await resolveName(approval.reviewedBy),
        reason: approval.decisionReason ?? "",
      });
    }

    // --- Every policy in force --------------------------------------------
    const policies = rules
      .filter(withinScope)
      .filter((rule) => rule.isActive)
      .map((rule) => ({
        id: rule._id as string,
        name: rule.name ?? "",
        priority: rule.priority,
        instruction: rule.instruction,
        scope: rule.agentId ? "One assistant" : rule.companyId ? "One workspace" : "Everywhere",
      }));

    const register = sortRegister(entries);
    const blocked = narrated.reduce((total, run) => total + run.blockedCount, 0);

    return {
      register,
      runs: narrated.sort((a, b) => b.at - a.at),
      decisions: decisions.sort((a, b) => b.at - a.at),
      policies,
      models: Array.from(
        new Set(runsInPeriod.map((run) => run.modelId).filter((id): id is string => Boolean(id))),
      ).sort(),
      summary: summarisePack({
        systems: register.length,
        runs: narrated.length,
        approvals: decisions.length,
        blocked,
      }),
      counts: {
        systems: register.length,
        runs: narrated.length,
        decisions: decisions.length,
        policies: policies.length,
        blocked,
      },
      runsOmitted,
    };
  },
});

/** The record that this pack was taken, and by whom. */
export const recordExport = internalMutation({
  args: {
    actorId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    from: v.number(),
    to: v.number(),
    // Spelled out rather than `v.any()`. A validator that accepts anything
    // tells the next reader nothing about what is recorded, and it costs the
    // generated types their precision across the whole data model.
    counts: v.object({
      systems: v.number(),
      runs: v.number(),
      decisions: v.number(),
      policies: v.number(),
      blocked: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actionType: "EXPORT_EVIDENCE_PACK",
      actorId: args.actorId,
      entityType: "governance",
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        periodFrom: args.from,
        periodTo: args.to,
        counts: args.counts,
      }),
    });
  },
});

export const produce = governanceAction({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args): Promise<ProducedEvidencePack> => {
    /**
     * Whose evidence this is.
     *
     * The two platform roles take the whole platform; everyone else takes their
     * own workspace. Proving that a customer's pack contains their records and
     * nobody else's is the part of this that actually matters, so the scope is
     * decided here from the caller rather than passed in by the screen.
     */
    const platformWide = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY";
    const companyId = platformWide ? undefined : getActiveCompanyId(ctx.user);

    if (!platformWide && !companyId) {
      throw appError("NO_ACTIVE_COMPANY", "This account is not attached to a workspace, so it has no evidence to export.");
    }

    const pack = await ctx.runQuery(internal.evidencePack.gather, {
      from: args.from,
      to: args.to,
      companyId,
    });

    // Taking a copy of the evidence is itself a governance action, so it goes
    // on the record the pack is drawn from.
    await ctx.runMutation(internal.evidencePack.recordExport, {
      actorId: ctx.userId,
      companyId,
      from: args.from,
      to: args.to,
      counts: pack.counts,
    });

    return { ...pack, scope: platformWide ? "PLATFORM" : "WORKSPACE" };
  },
});
