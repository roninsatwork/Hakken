import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./authz";
import { isGlobalAgent } from "./agentService";
import { buildAgentReadiness } from "./agents";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

const DEFAULT_AGENT_LIMIT = 120;
const MAX_AGENT_LIMIT = 250;
const RECENT_RELEASE_LIMIT = 25;

type ReleaseStatus = "DRAFT_BLOCKED" | "READY_FOR_RELEASE" | "LIVE_NEEDS_ATTENTION" | "LIVE";
type AgentReleaseStatus = "PENDING_SIGNOFF" | "APPROVED" | "ACTIVATED" | "ROLLED_BACK" | "CANCELLED";

const terminalReleaseStatuses: AgentReleaseStatus[] = ["ACTIVATED", "ROLLED_BACK", "CANCELLED"];

function parseReadinessForStorage(readiness: Awaited<ReturnType<typeof buildAgentReadiness>>) {
  return {
    activationWarnings: readiness.activationWarnings,
    toolBindingCount: readiness.toolBindingCount,
    knowledgeDocumentCount: readiness.knowledgeDocumentCount,
    activeEvalFixtureCount: readiness.activeEvalFixtureCount,
    successfulSmokeEvalRunCount: readiness.successfulSmokeEvalRunCount,
    latestSmokeEvalAt: readiness.latestSmokeEvalAt,
    releaseGatePolicy: {
      mode: readiness.releaseGatePolicy.mode,
      criticalFixtureCount: readiness.releaseGatePolicy.criticalFixtureCount,
      passedCriticalFixtureCount: readiness.releaseGatePolicy.passedCriticalFixtureCount,
      blockedCriticalFixtureCount: readiness.releaseGatePolicy.blockedCriticalFixtureCount,
      warning: readiness.releaseGatePolicy.warning,
    },
    modelReadiness: readiness.modelReadiness,
  };
}

function getReleaseStatus(args: {
  isActive: boolean;
  activationWarnings: string[];
  activationRisk: boolean;
}): ReleaseStatus {
  if (args.isActive) {
    return args.activationRisk || args.activationWarnings.length > 0 ? "LIVE_NEEDS_ATTENTION" : "LIVE";
  }
  return args.activationWarnings.length === 0 ? "READY_FOR_RELEASE" : "DRAFT_BLOCKED";
}

function getPrimaryNextAction(status: ReleaseStatus, warnings: string[]) {
  if (status === "READY_FOR_RELEASE") return "Review release notes, owner, and activation window.";
  if (status === "LIVE") return "Monitor recent runs and keep release gates current.";
  if (warnings.includes("modelDefault")) return "Configure an enabled default model for agents.";
  if (warnings.includes("tools")) return "Attach at least one approved connector or tool.";
  if (warnings.includes("knowledge")) return "Add approved knowledge for the agent to use.";
  if (warnings.includes("evalFixtures")) return "Create at least one active eval fixture.";
  if (warnings.includes("smokeEval")) return "Run a successful smoke eval.";
  if (warnings.includes("releaseGate")) return "Pass the release gate or adjust the gate policy.";
  return "Review readiness warnings before activation.";
}

function assertReadyForRelease(readiness: Awaited<ReturnType<typeof buildAgentReadiness>>) {
  if (readiness.isActive) {
    throw new Error("Release candidate can only be created for a draft agent.");
  }
  if (readiness.activationWarnings.length > 0) {
    throw new Error("Release candidate blocked: resolve readiness warnings first.");
  }
  if (readiness.latestSmokeEvalRun?.status !== "SUCCESS") {
    throw new Error("Release candidate blocked: latest smoke eval must pass.");
  }
  if (readiness.releaseGatePolicy.blockedCriticalFixtureCount > 0 || readiness.releaseGatePolicy.warning) {
    throw new Error("Release candidate blocked: release gate must pass.");
  }
}

async function getLatestOpenRelease(ctx: { db: Parameters<typeof buildAgentReadiness>[0]["db"] }, agentId: Id<"agents">) {
  const releases = await ctx.db
    .query("agentReleases")
    .withIndex("by_agent_created", (q) => q.eq("agentId", agentId))
    .order("desc")
    .take(RECENT_RELEASE_LIMIT);
  return releases.find((release) => !terminalReleaseStatuses.includes(release.status as AgentReleaseStatus));
}

async function getReleaseWithAgent(ctx: { db: Parameters<typeof buildAgentReadiness>[0]["db"] }, releaseId: Id<"agentReleases">) {
  const release = await ctx.db.get(releaseId);
  if (!release) throw new Error("Release not found");
  const agent = await ctx.db.get(release.agentId);
  if (!agent) throw new Error("Agent not found");
  return { release, agent };
}

export const getReleaseReadinessOverview = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const limit = Math.min(Math.max(args.limit ?? DEFAULT_AGENT_LIMIT, 1), MAX_AGENT_LIMIT);
    const allAgents = await ctx.db
      .query("agents")
      .withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined))
      .order("desc")
      .take(limit);
    const globalAgents = allAgents.filter(isGlobalAgent);

    const agents = await Promise.all(globalAgents.map(async (agent) => {
      const readiness = await buildAgentReadiness(ctx, agent._id as Id<"agents">);
      const latestRelease = await ctx.db
        .query("agentReleases")
        .withIndex("by_agent_created", (q) => q.eq("agentId", agent._id))
        .order("desc")
        .first();
      const status = getReleaseStatus({
        isActive: readiness.isActive,
        activationRisk: readiness.activationRisk,
        activationWarnings: readiness.activationWarnings,
      });
      return {
        agentId: agent._id,
        name: agent.name,
        description: agent.description,
        isActive: readiness.isActive,
        status,
        activationRisk: readiness.activationRisk,
        activationWarnings: readiness.activationWarnings,
        toolBindingCount: readiness.toolBindingCount,
        knowledgeDocumentCount: readiness.knowledgeDocumentCount,
        activeEvalFixtureCount: readiness.activeEvalFixtureCount,
        successfulSmokeEvalRunCount: readiness.successfulSmokeEvalRunCount,
        latestSmokeEvalAt: readiness.latestSmokeEvalAt,
        releaseGatePolicy: {
          mode: readiness.releaseGatePolicy.mode,
          criticalFixtureCount: readiness.releaseGatePolicy.criticalFixtureCount,
          passedCriticalFixtureCount: readiness.releaseGatePolicy.passedCriticalFixtureCount,
          blockedCriticalFixtureCount: readiness.releaseGatePolicy.blockedCriticalFixtureCount,
          warning: readiness.releaseGatePolicy.warning,
        },
        modelReadiness: readiness.modelReadiness,
        latestRelease: latestRelease ? {
          releaseId: latestRelease._id,
          status: latestRelease.status,
          title: latestRelease.title,
          createdAt: latestRelease.createdAt,
          approvedAt: latestRelease.approvedAt,
          activatedAt: latestRelease.activatedAt,
          rolledBackAt: latestRelease.rolledBackAt,
        } : null,
        nextAction: getPrimaryNextAction(status, readiness.activationWarnings),
        updatedAt: agent.updatedAt,
        createdAt: agent.createdAt,
      };
    }));

    const statusRank: Record<ReleaseStatus, number> = {
      LIVE_NEEDS_ATTENTION: 0,
      DRAFT_BLOCKED: 1,
      READY_FOR_RELEASE: 2,
      LIVE: 3,
    };
    agents.sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.updatedAt - a.updatedAt);

    const summary = agents.reduce((acc, agent) => {
      acc.total += 1;
      acc[agent.status] += 1;
      if (agent.activationWarnings.length > 0) acc.warningCount += agent.activationWarnings.length;
      return acc;
    }, {
      total: 0,
      DRAFT_BLOCKED: 0,
      READY_FOR_RELEASE: 0,
      LIVE_NEEDS_ATTENTION: 0,
      LIVE: 0,
      warningCount: 0,
    });

    return {
      generatedAt: Date.now(),
      summary,
      agents,
    };
  },
});

export const getRecentReleases = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const releases = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "PENDING_SIGNOFF"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT);
    const approved = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "APPROVED"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT);
    const activated = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "ACTIVATED"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT);
    const rolledBack = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "ROLLED_BACK"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT);
    const combined = [...releases, ...approved, ...activated, ...rolledBack]
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, RECENT_RELEASE_LIMIT);

    return await Promise.all(combined.map(async (release) => {
      const [agent, version] = await Promise.all([
        ctx.db.get(release.agentId),
        ctx.db.get(release.agentVersionId),
      ]);
      return {
        ...release,
        agentName: agent?.name ?? "Deleted agent",
        versionNumber: version?.versionNumber,
      };
    }));
  },
});

export const getLatestReleaseForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const release = await ctx.db
      .query("agentReleases")
      .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .first();
    if (!release) return null;

    const version = await ctx.db.get(release.agentVersionId);
    return {
      ...release,
      versionNumber: version?.versionNumber,
    };
  },
});

export const createReleaseCandidate = mutation({
  args: {
    agentId: v.id("agents"),
    title: v.optional(v.string()),
    releaseNotes: v.optional(v.string()),
    rollbackPlan: v.optional(v.string()),
    activationWindowStart: v.optional(v.number()),
    activationWindowEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");
    if (!isGlobalAgent(agent)) throw new Error("Release candidate can only be created for a global agent.");
    const openRelease = await getLatestOpenRelease(ctx, args.agentId);
    if (openRelease) {
      throw new Error("Release candidate already exists for this agent.");
    }

    const readiness = await buildAgentReadiness(ctx, args.agentId);
    assertReadyForRelease(readiness);
    const versionId = await ensureAgentVersionSnapshot(ctx, { agentId: args.agentId });
    const now = Date.now();
    const releaseId = await ctx.db.insert("agentReleases", {
      agentId: args.agentId,
      agentVersionId: versionId,
      status: "PENDING_SIGNOFF",
      title: args.title?.trim() || `${agent.name} release candidate`,
      releaseNotes: args.releaseNotes?.trim() || "Ready for sign-off after passing readiness checks and release gate coverage.",
      rollbackPlan: args.rollbackPlan?.trim() || "Rollback by deactivating this agent and reviewing latest runs before a new release candidate is created.",
      activationWindowStart: args.activationWindowStart,
      activationWindowEnd: args.activationWindowEnd,
      readinessJson: JSON.stringify(parseReadinessForStorage(readiness)),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: releaseId,
      timestamp: now,
      metadata: JSON.stringify({ agentId: args.agentId, agentVersionId: versionId }),
    });

    return releaseId;
  },
});

export const approveReleaseCandidate = mutation({
  args: {
    releaseId: v.id("agentReleases"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    const { release } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "PENDING_SIGNOFF") {
      throw new Error("Only pending release candidates can be approved.");
    }

    const readiness = await buildAgentReadiness(ctx, release.agentId);
    assertReadyForRelease(readiness);
    const now = Date.now();
    await ctx.db.patch(args.releaseId, {
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: now,
      updatedAt: now,
      readinessJson: JSON.stringify(parseReadinessForStorage(readiness)),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "APPROVE_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({ agentId: release.agentId, agentVersionId: release.agentVersionId }),
    });
    return args.releaseId;
  },
});

export const activateReleaseCandidate = mutation({
  args: {
    releaseId: v.id("agentReleases"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    const { release, agent } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "APPROVED") {
      throw new Error("Release must be approved before activation.");
    }
    const readiness = await buildAgentReadiness(ctx, release.agentId);
    assertReadyForRelease(readiness);
    const now = Date.now();
    await ctx.db.patch(release.agentId, {
      isActive: true,
      updatedAt: now,
    });
    await ctx.db.patch(args.releaseId, {
      status: "ACTIVATED",
      activatedBy: userId,
      activatedAt: now,
      updatedAt: now,
      readinessJson: JSON.stringify(parseReadinessForStorage(readiness)),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "ACTIVATE_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({ agentId: release.agentId, agentName: agent.name, agentVersionId: release.agentVersionId }),
    });
    return args.releaseId;
  },
});

export const rollbackRelease = mutation({
  args: {
    releaseId: v.id("agentReleases"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    const { release, agent } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "ACTIVATED") {
      throw new Error("Only activated releases can be rolled back.");
    }

    const now = Date.now();
    await ctx.db.patch(release.agentId, {
      isActive: false,
      updatedAt: now,
    });
    await ctx.db.patch(args.releaseId, {
      status: "ROLLED_BACK",
      rolledBackBy: userId,
      rolledBackAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "ROLLBACK_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({ agentId: release.agentId, agentName: agent.name, agentVersionId: release.agentVersionId }),
    });
    return args.releaseId;
  },
});
