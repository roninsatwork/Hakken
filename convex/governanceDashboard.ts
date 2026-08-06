import type { Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";
import { governanceQuery } from "./tenantFunctions";
import { parsePurgePipelineConfig } from "./purgeScheduleService";
import {
  assessRetention,
  countCheck,
  countStaleApprovals,
  orderChecks,
  summariseDashboard,
  type GovernanceCheck,
} from "./governanceDashboardService";
import { checkConformance, type ConformanceFinding, type SideEffectLevel } from "./conformanceService";
import {
  sortRegister,
  summariseRegister,
  toAssistantEntry,
  toWidgetEntry,
  toWorkflowEntry,
  type AiSystemEntry,
} from "./governanceRegisterService";

/**
 * What needs a person, right now.
 *
 * Reads the register rather than counting anything of its own, so the dashboard
 * and the register cannot disagree about the state of the estate — which is the
 * usual way a compliance screen starts lying.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const SCAN_LIMIT = 500;

export type GovernanceDashboard = {
  /** Assistants doing more than their rating claims. */
  conformance: ConformanceFinding[];
  scope: "PLATFORM" | "WORKSPACE";
  attention: number;
  state: "NEEDS_ATTENTION" | "SETTLED" | "NOT_SET_UP";
  systems: number;
  checks: GovernanceCheck[];
  /** Named pipelines set below the six months such records are expected to be kept. */
  retentionTooShort: string[];
};

export const getGovernanceDashboard = governanceQuery({
  args: {},
  handler: async (ctx): Promise<GovernanceDashboard> => {
    const platformWide = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY";
    const scopeCompanyId = platformWide ? undefined : getActiveCompanyId(ctx.user);

    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;

    const [agents, widgets, workflows, approvals, purgeConfig] = await Promise.all([
      ctx.db.query("agents").take(SCAN_LIMIT),
      ctx.db.query("widgets").take(SCAN_LIMIT),
      ctx.db.query("workflows").take(SCAN_LIMIT),
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
        .take(SCAN_LIMIT),
      ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
        .first(),
    ]);

    const agentById = new Map(agents.map((agent) => [agent._id as string, agent]));
    const entries: AiSystemEntry[] = [];

    for (const agent of agents.filter(withinScope)) {
      entries.push(toAssistantEntry(agent, agent.ownerId ? "recorded" : "", agent.updatedAt));
    }
    for (const widget of widgets.filter(withinScope)) {
      const agent = widget.agentId ? (agentById.get(widget.agentId) ?? null) : null;
      entries.push(toWidgetEntry(widget, widget.createdBy ? "recorded" : "", agent));
    }
    for (const workflow of workflows.filter(withinScope)) {
      entries.push(toWorkflowEntry(workflow, workflow.createdBy ? "recorded" : ""));
    }

    const register = sortRegister(entries);
    const summary = summariseRegister(register);

    const scopedApprovals = approvals.filter(withinScope);
    const stale = countStaleApprovals(
      scopedApprovals.map((approval) => approval.requestedAt),
      Date.now(),
    );

    /**
     * Whether each assistant is still doing what it was approved to do.
     *
     * Read from what the runs actually did rather than from anyone's opinion:
     * a rating is a claim about behaviour, and the tool calls are the record of
     * the behaviour. Bounded to recent calls so this stays a dashboard query.
     */
    const recentCalls = await ctx.db.query("agentToolCalls").order("desc").take(SCAN_LIMIT);
    const observedByAgent = new Map<string, SideEffectLevel[]>();
    for (const call of recentCalls) {
      if (!call.sideEffectLevel) continue;
      const key = call.agentId as string;
      observedByAgent.set(key, [...(observedByAgent.get(key) ?? []), call.sideEffectLevel]);
    }

    const conformance: ConformanceFinding[] = [];
    for (const agent of agents.filter(withinScope)) {
      const finding = checkConformance({
        agentId: agent._id,
        agentName: agent.name,
        rating: agent.riskLevel,
        observed: observedByAgent.get(agent._id as string) ?? [],
      });
      if (finding) conformance.push(finding);
    }

    const pipelines = Object.entries(parsePurgePipelineConfig(purgeConfig?.value)).map(
      ([key, pipeline]) => ({ key, enabled: pipeline.enabled, retentionDays: pipeline.retentionDays }),
    );
    const retention = assessRetention(pipelines);

    const base = platformWide ? "/admin/governance" : "/app/governance";

    const checks: GovernanceCheck[] = orderChecks([
      countCheck("unrated", summary.unrated, `${base}/register`),
      countCheck("incomplete", summary.incomplete, `${base}/register`),
      countCheck("staleApprovals", stale, `${base}/approvals`),
      countCheck("waitingApprovals", scopedApprovals.length, `${base}/approvals`),
      // A high-risk system running unattended should be impossible now, so a
      // count above nought means something predates the rule rather than that
      // somebody switched it off.
      countCheck(
        "unattendedHighRisk",
        register.filter((entry) => entry.risk === "HIGH" && !entry.humanApproves).length,
        `${base}/register`,
      ),
      countCheck("conformance", conformance.length, `${base}/register`),
      countCheck("publicFacing", summary.publicFacing, `${base}/register`),
      { key: "retention", state: retention.state, href: "/admin/settings?tab=purges" },
    ]);

    return {
      scope: platformWide ? "PLATFORM" : "WORKSPACE",
      ...summariseDashboard(checks),
      systems: register.length,
      checks,
      conformance,
      retentionTooShort: retention.tooShort,
    };
  },
});
