import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { isGlobalAgent } from "./agentService";
import { AGENT_LIMIT_OVERRIDE_FIELDS, clampAgentLimitOverride } from "./agentRuntimeService";
import { clampAgentApprovalExpiryHours } from "./approvalExpiryService";
import { buildAgentReadiness } from "./agents";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

const DEFAULT_AGENT_LIMIT = 120;
const MAX_AGENT_LIMIT = 250;
const RECENT_RELEASE_LIMIT = 25;

type ReleaseStatus = "DRAFT_BLOCKED" | "READY_FOR_RELEASE" | "LIVE_NEEDS_ATTENTION" | "LIVE";
type AgentReleaseStatus = "PENDING_SIGNOFF" | "APPROVED" | "ACTIVATED" | "ROLLED_BACK" | "CANCELLED";

const terminalReleaseStatuses: AgentReleaseStatus[] = ["ACTIVATED", "ROLLED_BACK", "CANCELLED"];

const versionHashComparisons: Array<{
  key: keyof Pick<Doc<"agentVersions">, "promptHash" | "toolSetHash" | "memoryRevisionHash" | "ruleSetHash" | "modelConfigHash" | "policyHash">;
  label: string;
}> = [
  { key: "promptHash", label: "Prompt and schemas" },
  { key: "toolSetHash", label: "Tools" },
  { key: "memoryRevisionHash", label: "Memory" },
  { key: "ruleSetHash", label: "Rules" },
  { key: "modelConfigHash", label: "Model config" },
  { key: "policyHash", label: "Policy" },
];

type ReleaseSnapshotComparison = {
  baselineReleaseId?: Id<"agentReleases">;
  baselineTitle?: string;
  baselineVersionNumber?: number;
  currentVersionNumber?: number;
  changedAreas: string[];
  unchangedAreas: string[];
  details: Array<{
    area: string;
    before: string;
    after: string;
  }>;
  summary: string;
};

type ReleaseEvidenceStatus = "PASS" | "WARN";

type ReleaseEvidenceSummary = {
  summary: string;
  items: Array<{
    label: string;
    value: string;
    status: ReleaseEvidenceStatus;
  }>;
};

type ReleaseNextAction = {
  tone: "READY" | "REVIEW" | "WAIT" | "BLOCKED";
  label: string;
  detail: string;
};

type StoredReleaseReadiness = {
  toolBindingCount?: number;
  knowledgeDocumentCount?: number;
  activeEvalFixtureCount?: number;
  successfulSmokeEvalRunCount?: number;
  latestSmokeEvalAt?: number;
  releaseGatePolicy?: {
    mode?: string;
    criticalFixtureCount?: number;
    passedCriticalFixtureCount?: number;
    blockedCriticalFixtureCount?: number;
    warning?: string;
  };
  modelReadiness?: {
    status?: string;
  };
};

type AgentSnapshot = {
  agent?: {
    name?: string;
    description?: string;
  };
  prompt?: {
    systemPrompt?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  };
  tools?: Array<{
    name?: string;
    handlerMapping?: string;
  }>;
  rules?: Array<{
    name?: string;
    trigger?: string;
  }>;
  memory?: {
    activeCount?: number;
    kinds?: Record<string, number>;
  };
  model?: {
    modelId?: string;
    modelSelectionMode?: string;
    reasoningEffort?: string;
    temperature?: number;
    thinkingMode?: boolean;
  };
  policy?: {
    humanApprovalRequired?: boolean;
    autonomousToolExecution?: boolean;
    approvalExpiryHours?: number;
    maxSteps?: number;
    maxToolCalls?: number;
    maxRuntimeMs?: number;
    maxCostGBP?: number;
    allowInternetAccess?: boolean;
    triggerType?: string;
  };
};

type AgentPatch = Partial<Omit<Doc<"agents">, "_id" | "_creationTime">>;
type ReleaseMutationCtx = Pick<MutationCtx, "db">;

function parseReleaseReadiness(readinessJson?: string): StoredReleaseReadiness {
  if (!readinessJson) return {};
  try {
    const parsed = JSON.parse(readinessJson) as StoredReleaseReadiness;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildReleaseEvidenceSummary(release: Pick<Doc<"agentReleases">, "readinessJson">): ReleaseEvidenceSummary {
  const readiness = parseReleaseReadiness(release.readinessJson);
  const releaseGatePolicy = readiness.releaseGatePolicy ?? {};
  const toolCount = readiness.toolBindingCount ?? 0;
  const knowledgeCount = readiness.knowledgeDocumentCount ?? 0;
  const fixtureCount = readiness.activeEvalFixtureCount ?? 0;
  const smokeEvalCount = readiness.successfulSmokeEvalRunCount ?? 0;
  const criticalFixtureCount = releaseGatePolicy.criticalFixtureCount ?? 0;
  const passedCriticalFixtureCount = releaseGatePolicy.passedCriticalFixtureCount ?? 0;
  const blockedCriticalFixtureCount = releaseGatePolicy.blockedCriticalFixtureCount ?? 0;
  const releaseGatePasses = !releaseGatePolicy.warning && blockedCriticalFixtureCount === 0;
  const modelPasses = readiness.modelReadiness?.status === "PASS";

  const items = [
    {
      label: "Tools",
      value: `${toolCount} attached`,
      status: toolCount > 0 ? "PASS" : "WARN",
    },
    {
      label: "Knowledge",
      value: `${knowledgeCount} document${knowledgeCount === 1 ? "" : "s"}`,
      status: knowledgeCount > 0 ? "PASS" : "WARN",
    },
    {
      label: "Fixtures",
      value: `${fixtureCount} active`,
      status: fixtureCount > 0 ? "PASS" : "WARN",
    },
    {
      label: "Smoke evals",
      value: `${smokeEvalCount} passed`,
      status: smokeEvalCount > 0 ? "PASS" : "WARN",
    },
    {
      label: "Release gate",
      value: releaseGatePolicy.warning
        ? releaseGatePolicy.warning
        : `${passedCriticalFixtureCount}/${criticalFixtureCount} critical passed`,
      status: releaseGatePasses ? "PASS" : "WARN",
    },
    {
      label: "Model",
      value: modelPasses ? "Configured" : "Needs model default",
      status: modelPasses ? "PASS" : "WARN",
    },
  ] satisfies ReleaseEvidenceSummary["items"];

  const warningCount = items.filter((item) => item.status === "WARN").length;
  return {
    summary: warningCount === 0
      ? "Release evidence was complete when this record was created or refreshed."
      : `${warningCount} evidence item${warningCount === 1 ? "" : "s"} need review from the stored release snapshot.`,
    items,
  };
}

function buildReleaseNextAction(
  release: Pick<Doc<"agentReleases">, "status" | "activationWindowStart" | "activationWindowEnd" | "cancellationReason" | "rollbackReason">,
  evidenceSummary: ReleaseEvidenceSummary,
  now = Date.now()
): ReleaseNextAction {
  const hasEvidenceWarning = evidenceSummary.items.some((item) => item.status === "WARN");
  if (release.status === "PENDING_SIGNOFF") {
    return hasEvidenceWarning ? {
      tone: "REVIEW",
      label: "Resolve evidence warnings",
      detail: "Review the stored release evidence before approving or cancelling this candidate.",
    } : {
      tone: "READY",
      label: "Ready for sign-off",
      detail: "Review evidence, snapshot changes, owner, and activation window; then approve or cancel.",
    };
  }

  if (release.status === "APPROVED") {
    if (release.activationWindowStart && now < release.activationWindowStart) {
      return {
        tone: "WAIT",
        label: "Wait for activation window",
        detail: "This candidate is approved, but its activation window has not opened yet.",
      };
    }
    if (release.activationWindowEnd && now > release.activationWindowEnd) {
      return {
        tone: "BLOCKED",
        label: "Activation window expired",
        detail: "Cancel this candidate or create a replacement with a reviewed activation window.",
      };
    }
    return {
      tone: "READY",
      label: "Ready to activate",
      detail: "Activate during the approved window, or cancel if release scope has changed.",
    };
  }

  if (release.status === "ACTIVATED") {
    return {
      tone: "REVIEW",
      label: "Monitor live release",
      detail: "Watch recent runs and rollback with a reason if release evidence regresses.",
    };
  }

  if (release.status === "ROLLED_BACK") {
    return {
      tone: "BLOCKED",
      label: "Investigate rollback",
      detail: release.rollbackReason
        ? "Use the rollback reason, recent runs, and snapshot comparison before creating a replacement candidate."
        : "Review recent runs and snapshot comparison before creating a replacement candidate.",
    };
  }

  return {
    tone: "REVIEW",
    label: "Candidate cancelled",
    detail: release.cancellationReason
      ? "Create a replacement only after the cancellation reason is resolved."
      : "Create a replacement only if scope is clear and readiness evidence still passes.",
  };
}

function parseSnapshot(snapshotJson?: string): AgentSnapshot {
  if (!snapshotJson) return {};
  try {
    const parsed = JSON.parse(snapshotJson) as AgentSnapshot;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseOptionalSchema(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function parseModelSelectionMode(value: unknown): Doc<"agents">["modelSelectionMode"] | undefined {
  return value === "inherit" || value === "override" ? value : undefined;
}

function parseReasoningEffort(value: unknown): Doc<"agents">["reasoningEffort"] | undefined {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : undefined;
}

function parseTriggerType(value: unknown): Doc<"agents">["triggerType"] | undefined {
  return value === "MANUAL" || value === "WEBHOOK" || value === "SCHEDULE" ? value : undefined;
}

function buildAgentRestorePatch(snapshot: AgentSnapshot, now: number): AgentPatch {
  const patch: AgentPatch = {
    updatedAt: now,
    isActive: true,
  };
  if (snapshot.agent?.name) patch.name = snapshot.agent.name;
  if ("description" in (snapshot.agent ?? {})) patch.description = snapshot.agent?.description;
  if (snapshot.prompt) {
    patch.systemPrompt = snapshot.prompt.systemPrompt ?? "";
    patch.inputSchema = parseOptionalSchema(snapshot.prompt.inputSchema);
    patch.outputSchema = parseOptionalSchema(snapshot.prompt.outputSchema);
  }
  if (snapshot.model) {
    if (snapshot.model.modelId) patch.modelId = snapshot.model.modelId;
    patch.modelSelectionMode = parseModelSelectionMode(snapshot.model.modelSelectionMode);
    patch.reasoningEffort = parseReasoningEffort(snapshot.model.reasoningEffort);
    if (typeof snapshot.model.temperature === "number") patch.temperature = snapshot.model.temperature;
    if (typeof snapshot.model.thinkingMode === "boolean") patch.thinkingMode = snapshot.model.thinkingMode;
  }
  if (snapshot.policy) {
    if (typeof snapshot.policy.humanApprovalRequired === "boolean") patch.humanApprovalRequired = snapshot.policy.humanApprovalRequired;
    if (typeof snapshot.policy.autonomousToolExecution === "boolean") patch.autonomousToolExecution = snapshot.policy.autonomousToolExecution;
    if (typeof snapshot.policy.approvalExpiryHours === "number") {
      patch.approvalExpiryHours = clampAgentApprovalExpiryHours(snapshot.policy.approvalExpiryHours);
    }
    // Restored through the same clamp as a live edit, so a rollback to a snapshot
    // taken before the ceilings tightened cannot reinstate a budget above them.
    for (const field of AGENT_LIMIT_OVERRIDE_FIELDS) {
      const stored = snapshot.policy[field];
      if (typeof stored === "number") patch[field] = clampAgentLimitOverride(field, stored);
    }
    if (typeof snapshot.policy.allowInternetAccess === "boolean") patch.allowInternetAccess = snapshot.policy.allowInternetAccess;
    patch.triggerType = parseTriggerType(snapshot.policy.triggerType);
  }
  return patch;
}

function summarizeText(value?: string) {
  if (!value?.trim()) return "Empty";
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

function summarizeSchema(value: unknown) {
  if (!value) return "None";
  if (typeof value === "string") return summarizeText(value);
  try {
    return summarizeText(JSON.stringify(value));
  } catch {
    return "Configured";
  }
}

function summarizeTools(tools?: AgentSnapshot["tools"]) {
  if (!tools || tools.length === 0) return "No tools";
  return tools
    .map((tool) => tool.handlerMapping || tool.name || "Unnamed tool")
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 5)
    .join(", ");
}

function summarizeRules(rules?: AgentSnapshot["rules"]) {
  if (!rules || rules.length === 0) return "No active rules";
  return rules
    .map((rule) => rule.name || rule.trigger || "Unnamed rule")
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 5)
    .join(", ");
}

function summarizeMemory(memory?: AgentSnapshot["memory"]) {
  if (!memory?.activeCount) return "No active memories";
  const kinds = Object.entries(memory.kinds ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(", ");
  return `${memory.activeCount} active${kinds ? ` (${kinds})` : ""}`;
}

function summarizeModel(model?: AgentSnapshot["model"]) {
  if (!model) return "No model config";
  return [
    model.modelSelectionMode || "inherit",
    model.modelId || "default",
    model.reasoningEffort || "standard",
    model.thinkingMode ? "thinking" : "no thinking",
  ].join(" / ");
}

function summarizePolicy(policy?: AgentSnapshot["policy"]) {
  if (!policy) return "No policy config";
  return [
    policy.autonomousToolExecution
      ? "autonomous"
      : policy.humanApprovalRequired ? "approval required" : "approval not required",
    policy.allowInternetAccess ? "internet allowed" : "internet blocked",
    policy.triggerType || "manual trigger",
    // The spend ceiling is the one budget figure worth reading in a release
    // diff: on an autonomous agent it is the last thing bounding a run.
    policy.maxCostGBP === undefined ? "default budget" : `£${policy.maxCostGBP} budget`,
  ].join(" / ");
}

function buildSnapshotDetails(args: {
  changedAreas: string[];
  currentVersion: Doc<"agentVersions">;
  baselineVersion?: Doc<"agentVersions"> | null;
}) {
  const current = parseSnapshot(args.currentVersion.snapshotJson);
  const baseline = parseSnapshot(args.baselineVersion?.snapshotJson);
  const detailBuilders: Record<string, () => { area: string; before: string; after: string }> = {
    "Prompt and schemas": () => ({
      area: "Prompt and schemas",
      before: [
        `Prompt: ${summarizeText(baseline.prompt?.systemPrompt)}`,
        `Input: ${summarizeSchema(baseline.prompt?.inputSchema)}`,
        `Output: ${summarizeSchema(baseline.prompt?.outputSchema)}`,
      ].join(" | "),
      after: [
        `Prompt: ${summarizeText(current.prompt?.systemPrompt)}`,
        `Input: ${summarizeSchema(current.prompt?.inputSchema)}`,
        `Output: ${summarizeSchema(current.prompt?.outputSchema)}`,
      ].join(" | "),
    }),
    Tools: () => ({
      area: "Tools",
      before: summarizeTools(baseline.tools),
      after: summarizeTools(current.tools),
    }),
    Memory: () => ({
      area: "Memory",
      before: summarizeMemory(baseline.memory),
      after: summarizeMemory(current.memory),
    }),
    Rules: () => ({
      area: "Rules",
      before: summarizeRules(baseline.rules),
      after: summarizeRules(current.rules),
    }),
    "Model config": () => ({
      area: "Model config",
      before: summarizeModel(baseline.model),
      after: summarizeModel(current.model),
    }),
    Policy: () => ({
      area: "Policy",
      before: summarizePolicy(baseline.policy),
      after: summarizePolicy(current.policy),
    }),
    "Initial release snapshot": () => ({
      area: "Initial release snapshot",
      before: "No previous live snapshot",
      after: [
        `Prompt: ${summarizeText(current.prompt?.systemPrompt)}`,
        `Tools: ${summarizeTools(current.tools)}`,
        `Model: ${summarizeModel(current.model)}`,
      ].join(" | "),
    }),
  };
  return args.changedAreas
    .map((area) => detailBuilders[area]?.())
    .filter((detail): detail is { area: string; before: string; after: string } => Boolean(detail));
}

function normalizeActivationWindow(args: {
  activationWindowStart?: number;
  activationWindowEnd?: number;
}) {
  const activationWindowStart = args.activationWindowStart && Number.isFinite(args.activationWindowStart)
    ? args.activationWindowStart
    : undefined;
  const activationWindowEnd = args.activationWindowEnd && Number.isFinite(args.activationWindowEnd)
    ? args.activationWindowEnd
    : undefined;
  if (activationWindowStart && activationWindowEnd && activationWindowEnd <= activationWindowStart) {
    throw new Error("Activation window end must be after the start.");
  }
  return { activationWindowStart, activationWindowEnd };
}

function assertReleaseWindowOpen(release: { activationWindowStart?: number; activationWindowEnd?: number }, now: number) {
  if (release.activationWindowStart && now < release.activationWindowStart) {
    throw new Error("Release activation window has not opened yet.");
  }
  if (release.activationWindowEnd && now > release.activationWindowEnd) {
    throw new Error("Release activation window has expired.");
  }
}

function buildSnapshotComparison(args: {
  currentVersion: Doc<"agentVersions"> | null;
  baselineRelease?: Doc<"agentReleases"> | null;
  baselineVersion?: Doc<"agentVersions"> | null;
}): ReleaseSnapshotComparison | null {
  if (!args.currentVersion) return null;
  if (!args.baselineVersion || !args.baselineRelease) {
    return {
      currentVersionNumber: args.currentVersion.versionNumber,
      changedAreas: ["Initial release snapshot"],
      unchangedAreas: [],
      details: buildSnapshotDetails({
        changedAreas: ["Initial release snapshot"],
        currentVersion: args.currentVersion,
      }),
      summary: "No previous live release snapshot exists for comparison.",
    };
  }

  const changedAreas = versionHashComparisons
    .filter((comparison) => args.currentVersion?.[comparison.key] !== args.baselineVersion?.[comparison.key])
    .map((comparison) => comparison.label);
  const unchangedAreas = versionHashComparisons
    .filter((comparison) => args.currentVersion?.[comparison.key] === args.baselineVersion?.[comparison.key])
    .map((comparison) => comparison.label);

  return {
    baselineReleaseId: args.baselineRelease._id,
    baselineTitle: args.baselineRelease.title,
    baselineVersionNumber: args.baselineVersion.versionNumber,
    currentVersionNumber: args.currentVersion.versionNumber,
    changedAreas,
    unchangedAreas,
    details: buildSnapshotDetails({
      changedAreas,
      currentVersion: args.currentVersion,
      baselineVersion: args.baselineVersion,
    }),
    summary: changedAreas.length > 0
      ? `${changedAreas.length} release area${changedAreas.length === 1 ? "" : "s"} changed from the previous live snapshot.`
      : "No tracked configuration areas changed from the previous live snapshot.",
  };
}

async function getSnapshotComparison(
  ctx: { db: Parameters<typeof buildAgentReadiness>[0]["db"] },
  release: Doc<"agentReleases">,
  currentVersion: Doc<"agentVersions"> | null
) {
  const [activatedReleases, rolledBackReleases] = await Promise.all([
    ctx.db
      .query("agentReleases")
      .withIndex("by_agent_status_created", (q) => q.eq("agentId", release.agentId).eq("status", "ACTIVATED"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT),
    ctx.db
      .query("agentReleases")
      .withIndex("by_agent_status_created", (q) => q.eq("agentId", release.agentId).eq("status", "ROLLED_BACK"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT),
  ]);
  const baselineRelease = [...activatedReleases, ...rolledBackReleases]
    .filter((candidate) => candidate._id !== release._id && candidate.createdAt <= release.createdAt)
    .toSorted((left, right) =>
      (right.activatedAt ?? right.rolledBackAt ?? right.updatedAt)
      - (left.activatedAt ?? left.rolledBackAt ?? left.updatedAt)
    )
    [0] ?? null;
  const baselineVersion = baselineRelease ? await ctx.db.get(baselineRelease.agentVersionId) : null;
  return buildSnapshotComparison({
    currentVersion,
    baselineRelease,
    baselineVersion,
  });
}

async function getPreviousLiveRelease(
  ctx: { db: Parameters<typeof buildAgentReadiness>[0]["db"] },
  release: Doc<"agentReleases">
) {
  const [activatedReleases, rolledBackReleases] = await Promise.all([
    ctx.db
      .query("agentReleases")
      .withIndex("by_agent_status_created", (q) => q.eq("agentId", release.agentId).eq("status", "ACTIVATED"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT),
    ctx.db
      .query("agentReleases")
      .withIndex("by_agent_status_created", (q) => q.eq("agentId", release.agentId).eq("status", "ROLLED_BACK"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT),
  ]);
  const previousRelease = [...activatedReleases, ...rolledBackReleases]
    .filter((candidate) => candidate._id !== release._id && candidate.createdAt <= release.createdAt)
    .toSorted((left, right) =>
      (right.activatedAt ?? right.rolledBackAt ?? right.updatedAt)
      - (left.activatedAt ?? left.rolledBackAt ?? left.updatedAt)
    )
    [0] ?? null;
  if (!previousRelease) {
    return { previousRelease: null, previousVersion: null };
  }
  return {
    previousRelease,
    previousVersion: await ctx.db.get(previousRelease.agentVersionId),
  };
}

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

export const getReleaseReadinessOverview = superAdminQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
          ownerEmail: latestRelease.ownerEmail,
          activationWindowStart: latestRelease.activationWindowStart,
          activationWindowEnd: latestRelease.activationWindowEnd,
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

export const getRecentReleases = superAdminQuery({
  args: {},
  handler: async (ctx) => {
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
    const cancelled = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "CANCELLED"))
      .order("desc")
      .take(RECENT_RELEASE_LIMIT);
    const combined = [...releases, ...approved, ...activated, ...rolledBack, ...cancelled]
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, RECENT_RELEASE_LIMIT);

    return await Promise.all(combined.map(async (release) => {
      const [agent, version] = await Promise.all([
        ctx.db.get(release.agentId),
        ctx.db.get(release.agentVersionId),
      ]);
      const snapshotComparison = await getSnapshotComparison(ctx, release, version);
      const evidenceSummary = buildReleaseEvidenceSummary(release);
      return {
        ...release,
        agentName: agent?.name ?? "Deleted agent",
        versionNumber: version?.versionNumber,
        evidenceSummary,
        nextAction: buildReleaseNextAction(release, evidenceSummary),
        snapshotComparison,
      };
    }));
  },
});

export const getLatestReleaseForAgent = superAdminQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("agentReleases")
      .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .first();
    if (!release) return null;

    const version = await ctx.db.get(release.agentVersionId);
    const snapshotComparison = await getSnapshotComparison(ctx, release, version);
    const evidenceSummary = buildReleaseEvidenceSummary(release);
    return {
      ...release,
      versionNumber: version?.versionNumber,
      evidenceSummary,
      nextAction: buildReleaseNextAction(release, evidenceSummary),
      snapshotComparison,
    };
  },
});

export const createReleaseCandidate = superAdminMutation({
  args: {
    agentId: v.id("agents"),
    title: v.optional(v.string()),
    releaseNotes: v.optional(v.string()),
    rollbackPlan: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    activationWindowStart: v.optional(v.number()),
    activationWindowEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
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
    const activationWindow = normalizeActivationWindow(args);
    const releaseId = await ctx.db.insert("agentReleases", {
      agentId: args.agentId,
      agentVersionId: versionId,
      status: "PENDING_SIGNOFF",
      title: args.title?.trim() || `${agent.name} release candidate`,
      releaseNotes: args.releaseNotes?.trim() || "Ready for sign-off after passing readiness checks and release gate coverage.",
      rollbackPlan: args.rollbackPlan?.trim() || "Rollback by restoring the previous live snapshot when available; otherwise deactivate this agent and review latest runs before a new release candidate is created.",
      ownerEmail: args.ownerEmail?.trim() || user.email,
      ...activationWindow,
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
      metadata: JSON.stringify({
        agentId: args.agentId,
        agentVersionId: versionId,
        ownerEmail: args.ownerEmail?.trim() || user.email,
        ...activationWindow,
      }),
    });

    return releaseId;
  },
});

export const approveReleaseCandidate = superAdminMutation({
  args: {
    releaseId: v.id("agentReleases"),
    approvalComment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
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
      approvalComment: args.approvalComment?.trim() || "Approved after developer/operator readiness review.",
      updatedAt: now,
      readinessJson: JSON.stringify(parseReadinessForStorage(readiness)),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "APPROVE_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: release.agentId,
        agentVersionId: release.agentVersionId,
        approvalComment: args.approvalComment?.trim() || "Approved after developer/operator readiness review.",
      }),
    });
    return args.releaseId;
  },
});

export const cancelReleaseCandidate = superAdminMutation({
  args: {
    releaseId: v.id("agentReleases"),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const { release } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "PENDING_SIGNOFF" && release.status !== "APPROVED") {
      throw new Error("Only pending or approved release candidates can be cancelled.");
    }

    const now = Date.now();
    const cancellationReason = args.cancellationReason?.trim()
      || "Cancelled before activation after developer/operator review.";
    await ctx.db.patch(args.releaseId, {
      status: "CANCELLED",
      cancelledBy: userId,
      cancelledAt: now,
      cancellationReason,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "CANCEL_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: release.agentId,
        agentVersionId: release.agentVersionId,
        cancellationReason,
      }),
    });
    return args.releaseId;
  },
});

async function activateReleaseRecord(
  ctx: ReleaseMutationCtx,
  args: {
    releaseId: Id<"agentReleases">;
    userId: Id<"users">;
    automated?: boolean;
    now?: number;
  }
) {
    const { release, agent } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "APPROVED") {
      throw new Error("Release must be approved before activation.");
    }
    const readiness = await buildAgentReadiness(ctx, release.agentId);
    assertReadyForRelease(readiness);
    const now = args.now ?? Date.now();
    assertReleaseWindowOpen(release, now);
    await ctx.db.patch(release.agentId, {
      isActive: true,
      updatedAt: now,
    });
    await ctx.db.patch(args.releaseId, {
      status: "ACTIVATED",
      activatedBy: args.userId,
      activatedAt: now,
      updatedAt: now,
      readinessJson: JSON.stringify(parseReadinessForStorage(readiness)),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "ACTIVATE_AGENT_RELEASE",
      actorId: args.userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: release.agentId,
        agentName: agent.name,
        agentVersionId: release.agentVersionId,
        automated: args.automated === true,
      }),
    });
    return args.releaseId;
}

export const activateReleaseCandidate = superAdminMutation({
  args: {
    releaseId: v.id("agentReleases"),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    return await activateReleaseRecord(ctx, {
      releaseId: args.releaseId,
      userId,
    });
  },
});

export const activateDueReleaseCandidates = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const releases = await ctx.db
      .query("agentReleases")
      .withIndex("by_status_created", (q) => q.eq("status", "APPROVED"))
      .order("asc")
      .take(args.limit ?? RECENT_RELEASE_LIMIT);
    const result: {
      checked: number;
      activated: number;
      skipped: number;
      failed: number;
      failures: Array<{ releaseId: Id<"agentReleases">; reason: string }>;
    } = {
      checked: releases.length,
      activated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };

    for (const release of releases) {
      if (!release.activationWindowStart || release.activationWindowStart > now) {
        result.skipped += 1;
        continue;
      }
      if (release.activationWindowEnd && release.activationWindowEnd < now) {
        result.skipped += 1;
        continue;
      }

      try {
        await activateReleaseRecord(ctx, {
          releaseId: release._id,
          userId: release.createdBy,
          automated: true,
          now,
        });
        result.activated += 1;
      } catch (error) {
        result.failed += 1;
        result.failures.push({
          releaseId: release._id,
          reason: error instanceof Error ? error.message : "Scheduled activation failed.",
        });
      }
    }

    return result;
  },
});

export const rollbackRelease = superAdminMutation({
  args: {
    releaseId: v.id("agentReleases"),
    rollbackReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const { release, agent } = await getReleaseWithAgent(ctx, args.releaseId);
    if (release.status !== "ACTIVATED") {
      throw new Error("Only activated releases can be rolled back.");
    }

    const now = Date.now();
    const { previousRelease, previousVersion } = await getPreviousLiveRelease(ctx, release);
    const restoredSnapshot = previousVersion ? parseSnapshot(previousVersion.snapshotJson) : null;
    const rollbackAgentPatch = restoredSnapshot
      ? buildAgentRestorePatch(restoredSnapshot, now)
      : { isActive: false, updatedAt: now };
    await ctx.db.patch(release.agentId, rollbackAgentPatch);
    const rollbackReason = args.rollbackReason?.trim()
      || "Rolled back after operator review. Inspect recent runs before creating a replacement candidate.";
    await ctx.db.patch(args.releaseId, {
      status: "ROLLED_BACK",
      rolledBackBy: userId,
      rolledBackAt: now,
      rollbackReason,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "ROLLBACK_AGENT_RELEASE",
      actorId: userId,
      entityType: "agentReleases",
      entityId: args.releaseId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: release.agentId,
        agentName: agent.name,
        agentVersionId: release.agentVersionId,
        rollbackReason,
        restoredReleaseId: previousRelease?._id,
        restoredAgentVersionId: previousVersion?._id,
        restoredVersionNumber: previousVersion?.versionNumber,
        restoredPreviousSnapshot: Boolean(restoredSnapshot),
      }),
    });
    return args.releaseId;
  },
});
