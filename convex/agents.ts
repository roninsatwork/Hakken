import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./authz";
import { SYSTEM_FAILSAFE_MODEL_ID, getDefaultModelId } from "./aiModelService";
import {
  buildAgentUpdatePatch,
  buildCreateAgentAuditMetadata,
  buildCreateAgentFromTemplateAuditMetadata,
  buildCreateInlineAgentAuditMetadata,
  buildDeleteAgentAuditMetadata,
  buildGlobalAgentRecord,
  buildInlineAgentRecord,
  buildPromoteAgentAuditMetadata,
  buildPromoteAgentPatch,
  buildUpdateAgentAuditMetadata,
  isGlobalAgent,
} from "./agentService";
import { getAgentTemplateById, getAgentTemplates } from "./agentTemplates";
import { seedFixturesForTemplate } from "./agentEvalFixtures";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

const AGENT_CATALOG_LIMIT = 500;
const DEFAULT_MODEL_LIMIT = 10;
const AGENT_TOOL_BINDING_LIMIT = 250;
const TEMPLATE_TOOL_LOOKUP_LIMIT = 250;
const AGENT_READINESS_LOOKBACK_LIMIT = 250;
const TEMPLATE_SETUP_OBJECTIVE_PREFIX = "Template setup:";
const SMOKE_EVAL_OBJECTIVE_PREFIX = "Smoke eval:";
const RELEASE_GATE_FIXTURE_TAGS = ["release-gate", "critical"];
type AgentModelSelectionMode = "inherit" | "override";
type AgentModelUseCase = "agent" | "workflow";
type AgentReadinessStatus = "PASS" | "WARN";
type AgentReadinessCheckKey = "draftStatus" | "modelDefault" | "tools" | "knowledge" | "evalFixtures" | "smokeEval" | "releaseGate";
type ReleaseGateMode = "TAG" | "PRESET" | "NONE";
type AgentEvalFixtureType =
  | "HAPPY_PATH"
  | "APPROVAL_PAUSE"
  | "REJECTED_ACTION"
  | "PROMPT_INJECTION"
  | "TENANT_BOUNDARY"
  | "BAD_TOOL_ARGS"
  | "CANCELLATION"
  | "REPLAYED_FAILURE"
  | "TOOL_PLAN"
  | "COST_LATENCY_BUDGET";

const EVAL_FIXTURE_TYPE_ORDER: AgentEvalFixtureType[] = [
  "HAPPY_PATH",
  "TOOL_PLAN",
  "APPROVAL_PAUSE",
  "REJECTED_ACTION",
  "PROMPT_INJECTION",
  "TENANT_BOUNDARY",
  "BAD_TOOL_ARGS",
  "CANCELLATION",
  "REPLAYED_FAILURE",
  "COST_LATENCY_BUDGET",
];

const agentBuilderIntentValidator = v.object({
  objective: v.optional(v.string()),
  audience: v.optional(v.string()),
  approvalPolicy: v.optional(v.string()),
  modelBehavior: v.optional(v.string()),
  knowledgePlan: v.optional(v.string()),
  toolPlan: v.optional(v.string()),
  smokeEvalRequired: v.optional(v.boolean()),
  readinessAcknowledged: v.optional(v.boolean()),
});

const releaseGateModeValidator = v.union(
  v.literal("TAG"),
  v.literal("PRESET"),
  v.literal("NONE")
);

function normalizeReleaseGateTags(tags: string[] | undefined) {
  return Array.from(new Set((tags && tags.length > 0 ? tags : RELEASE_GATE_FIXTURE_TAGS)
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"))
    .filter((tag) => tag.length > 0)
  )).slice(0, 12);
}

async function getModelByStableId(ctx: MutationCtx, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

async function getModelByStableIdForReadiness(ctx: Pick<QueryCtx, "db">, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

function modelSupportsUseCase(model: { supportedUseCases?: string[] }, useCase: AgentModelUseCase) {
  return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
}

function parseSmokeEvalMetadata(output: string | undefined) {
  if (!output) return {};
  try {
    const parsed = JSON.parse(output) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function isAgentEvalFixtureType(value: unknown): value is AgentEvalFixtureType {
  return typeof value === "string" && EVAL_FIXTURE_TYPE_ORDER.includes(value as AgentEvalFixtureType);
}

async function isProviderEnabledForReadiness(ctx: Pick<QueryCtx, "db">, providerKey: string | undefined) {
  if (!providerKey) return true;
  const provider = await ctx.db
    .query("aiProviders")
    .withIndex("by_provider_key", (q) => q.eq("providerKey", providerKey))
    .first();
  return provider?.isEnabled !== false;
}

async function resolveAgentModelReadiness(ctx: Pick<QueryCtx, "db">, args: {
  agent: {
    modelId: string;
    modelSelectionMode?: AgentModelSelectionMode;
    workflowId?: Id<"workflows">;
  };
}) {
  const useCase: AgentModelUseCase = args.agent.workflowId ? "workflow" : "agent";

  if (args.agent.modelSelectionMode === "override") {
    const overrideModel = await getModelByStableIdForReadiness(ctx, args.agent.modelId);
    const providerEnabled = await isProviderEnabledForReadiness(ctx, overrideModel?.providerKey);
    return {
      status: overrideModel?.isEnabled && modelSupportsUseCase(overrideModel, useCase) && providerEnabled ? "PASS" as const : "WARN" as const,
      source: "override" as const,
      useCase,
      modelId: args.agent.modelId,
      providerKey: overrideModel?.providerKey,
    };
  }

  const defaultRow = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
    .first();
  const configuredDefault = defaultRow ? await getModelByStableIdForReadiness(ctx, defaultRow.modelId) : null;
  const configuredProviderEnabled = await isProviderEnabledForReadiness(ctx, configuredDefault?.providerKey);
  if (configuredDefault?.isEnabled && modelSupportsUseCase(configuredDefault, useCase) && configuredProviderEnabled) {
    return {
      status: "PASS" as const,
      source: "useCaseDefault" as const,
      useCase,
      modelId: configuredDefault.modelId,
      providerKey: configuredDefault.providerKey,
    };
  }

  const fallbackDefault = defaultRow?.fallbackModelId
    ? await getModelByStableIdForReadiness(ctx, defaultRow.fallbackModelId)
    : null;
  const fallbackProviderEnabled = await isProviderEnabledForReadiness(ctx, fallbackDefault?.providerKey);
  if (fallbackDefault?.isEnabled && modelSupportsUseCase(fallbackDefault, useCase) && fallbackProviderEnabled) {
    return {
      status: "PASS" as const,
      source: "fallbackDefault" as const,
      useCase,
      modelId: fallbackDefault.modelId,
      providerKey: fallbackDefault.providerKey,
    };
  }

  const legacyDefaults = await ctx.db
    .query("aiModels")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .take(DEFAULT_MODEL_LIMIT);
  for (const legacyModel of legacyDefaults) {
    const legacyProviderEnabled = await isProviderEnabledForReadiness(ctx, legacyModel.providerKey);
    if (legacyModel.isEnabled && modelSupportsUseCase(legacyModel, useCase) && legacyProviderEnabled) {
      return {
        status: "PASS" as const,
        source: "legacyDefault" as const,
        useCase,
        modelId: legacyModel.modelId,
        providerKey: legacyModel.providerKey,
      };
    }
  }

  return {
    status: "WARN" as const,
    source: "missing" as const,
    useCase,
    modelId: args.agent.modelId,
    providerKey: undefined,
  };
}

async function resolveDefaultModelIdForUseCase(ctx: MutationCtx, useCase: AgentModelUseCase) {
  const defaultRow = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
    .first();

  const defaultModel = defaultRow ? await getModelByStableId(ctx, defaultRow.modelId) : null;
  if (defaultModel?.isEnabled && modelSupportsUseCase(defaultModel, useCase)) return defaultModel.modelId;

  if (defaultRow?.fallbackModelId) {
    const fallbackModel = await getModelByStableId(ctx, defaultRow.fallbackModelId);
    if (fallbackModel?.isEnabled && modelSupportsUseCase(fallbackModel, useCase)) return fallbackModel.modelId;
  }

  const legacyDefaults = await ctx.db
    .query("aiModels")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .take(DEFAULT_MODEL_LIMIT);

  return getDefaultModelId(legacyDefaults.filter((model) => modelSupportsUseCase(model, useCase))) || SYSTEM_FAILSAFE_MODEL_ID;
}

async function bindRecommendedTemplateTools(ctx: MutationCtx, args: {
  agentId: Id<"agents">;
  recommendedToolMappings: string[];
  assignedAt: number;
}) {
  const recommendedMappings = Array.from(new Set(args.recommendedToolMappings));
  if (recommendedMappings.length === 0) {
    return { toolBindingCount: 0, missingToolMappings: [] };
  }

  const availableTools = await ctx.db
    .query("aiTools")
    .withIndex("by_createdAt")
    .order("desc")
    .take(TEMPLATE_TOOL_LOOKUP_LIMIT);
  const activeToolByMapping = new Map<string, (typeof availableTools)[number]>();
  for (const tool of availableTools) {
    if (tool.isActive === false || !recommendedMappings.includes(tool.handlerMapping)) continue;
    if (!activeToolByMapping.has(tool.handlerMapping)) {
      activeToolByMapping.set(tool.handlerMapping, tool);
    }
  }

  let toolBindingCount = 0;
  const boundToolIds = new Set<string>();
  const missingToolMappings: string[] = [];
  for (const handlerMapping of recommendedMappings) {
    const tool = activeToolByMapping.get(handlerMapping);
    if (!tool) {
      missingToolMappings.push(handlerMapping);
      continue;
    }
    if (boundToolIds.has(tool._id)) continue;

    await ctx.db.insert("agentTools", {
      agentId: args.agentId,
      toolId: tool._id,
      assignedAt: args.assignedAt,
    });
    boundToolIds.add(tool._id);
    toolBindingCount += 1;
  }

  return { toolBindingCount, missingToolMappings };
}

async function assertModelOverrideAllowed(ctx: MutationCtx, args: { modelId: string; useCase: AgentModelUseCase }) {
  const model = await getModelByStableId(ctx, args.modelId);
  if (!model?.isEnabled) {
    throw new Error("Selected AI model is not enabled.");
  }

  if (!modelSupportsUseCase(model, args.useCase)) {
    throw new Error(`Selected AI model does not support the ${args.useCase} use case.`);
  }

  if (model.providerKey) {
    const provider = await ctx.db
      .query("aiProviders")
      .withIndex("by_provider_key", (q) => q.eq("providerKey", model.providerKey as string))
      .first();

    if (provider && !provider.isEnabled) {
      throw new Error("Selected AI model provider is disabled.");
    }
  }
}

async function buildAgentReadiness(ctx: Pick<QueryCtx, "db">, agentId: Id<"agents">) {
  const agent = await ctx.db.get(agentId);
  if (!agent) throw new Error("Agent not found");

  const [toolBindings, activeEvalFixtures, recentRuns] = await Promise.all([
    ctx.db
      .query("agentTools")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(AGENT_TOOL_BINDING_LIMIT),
    ctx.db
      .query("agentEvalFixtures")
      .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "ACTIVE"))
      .take(AGENT_READINESS_LOOKBACK_LIMIT),
    ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(AGENT_READINESS_LOOKBACK_LIMIT),
  ]);

  const smokeEvalRuns = recentRuns.filter((run) => run.objective.startsWith(SMOKE_EVAL_OBJECTIVE_PREFIX));
  const latestSmokeEvalRun = smokeEvalRuns[0];
  const smokeEvalStepGroups = await Promise.all(smokeEvalRuns.map((run) =>
    ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_step", (q) => q.eq("runId", run._id))
      .order("asc")
      .take(AGENT_READINESS_LOOKBACK_LIMIT)
  ));
  const smokeEvalRecords = smokeEvalRuns.map((run, index) => ({
    run,
    metadata: parseSmokeEvalMetadata(smokeEvalStepGroups[index]?.find((step) => step.kind === "OBSERVE")?.output),
  }));
  const successfulSmokeEvalRecords = smokeEvalRecords.filter((record) => record.run.status === "SUCCESS");
  const successfulSmokeEvalRuns = successfulSmokeEvalRecords.map((record) => record.run);
  const smokePassedFixtureTypes = new Set<AgentEvalFixtureType>();
  for (const { metadata } of successfulSmokeEvalRecords) {
    if (isAgentEvalFixtureType(metadata.fixtureType)) {
      smokePassedFixtureTypes.add(metadata.fixtureType);
    }
  }
  const latestSmokeEvalByFixtureId = new Map<string, {
    runId: Id<"agentRuns">;
    status: string;
    gradingMode: "CONTRACT_ONLY" | "MODEL_GRADED";
    startedAt: number;
    completedAt?: number;
    updatedAt: number;
  }>();
  for (const record of smokeEvalRecords) {
    const fixtureId = typeof record.metadata.fixtureId === "string" ? record.metadata.fixtureId : undefined;
    if (!fixtureId || latestSmokeEvalByFixtureId.has(fixtureId)) continue;
    latestSmokeEvalByFixtureId.set(fixtureId, {
      runId: record.run._id,
      status: record.run.status,
      gradingMode: record.metadata.gradingMode === "MODEL_GRADED" ? "MODEL_GRADED" : "CONTRACT_ONLY",
      startedAt: record.run.startedAt,
      completedAt: record.run.completedAt,
      updatedAt: record.run.updatedAt,
    });
  }
  const knowledgeDocumentCount = agent.knowledgeDocumentIds?.length ?? 0;
  const toolBindingCount = toolBindings.length;
  const activeEvalFixtureCount = activeEvalFixtures.length;
  const successfulSmokeEvalRunCount = successfulSmokeEvalRuns.length;
  const modelReadiness = await resolveAgentModelReadiness(ctx, { agent });
  const fixtureCoverage = EVAL_FIXTURE_TYPE_ORDER.map((type) => {
    const fixturesForType = activeEvalFixtures.filter((fixture) => fixture.type === type);
    const latestFixture = fixturesForType
      .toSorted((a, b) => b.createdAt - a.createdAt)[0];
    return {
      type,
      activeCount: fixturesForType.length,
      latestAt: latestFixture?.updatedAt ?? latestFixture?.createdAt,
      smokePassed: smokePassedFixtureTypes.has(type),
    };
  });
  const releaseGateMode: ReleaseGateMode = agent.releaseGateMode ?? "TAG";
  const releaseGateTags = normalizeReleaseGateTags(agent.releaseGateTags);
  const releaseGateSuitePreset = agent.releaseGateSuitePresetId
    ? await ctx.db.get(agent.releaseGateSuitePresetId)
    : null;
  const releaseGateRequiresModelGrading = agent.releaseGateRequiresModelGrading === true
    || (releaseGateSuitePreset?.status === "ACTIVE" && releaseGateSuitePreset.requiresModelGrading === true);
  let releaseGateFixtures: typeof activeEvalFixtures = [];
  let releaseGatePolicyWarning: string | undefined;

  if (releaseGateMode === "TAG") {
    releaseGateFixtures = activeEvalFixtures.filter((fixture) =>
      fixture.tags.some((tag) => releaseGateTags.includes(tag))
    );
  } else if (releaseGateMode === "PRESET") {
    if (!agent.releaseGateSuitePresetId || !releaseGateSuitePreset || releaseGateSuitePreset.agentId !== agentId) {
      releaseGatePolicyWarning = "Release gate preset is missing.";
    } else if (releaseGateSuitePreset.status !== "ACTIVE") {
      releaseGatePolicyWarning = "Release gate preset is archived.";
    } else if (releaseGateSuitePreset.fixtureIds && releaseGateSuitePreset.fixtureIds.length > 0) {
      const fixtureIdSet = new Set(releaseGateSuitePreset.fixtureIds);
      releaseGateFixtures = activeEvalFixtures.filter((fixture) => fixtureIdSet.has(fixture._id));
    } else if (releaseGateSuitePreset.suiteTag) {
      releaseGateFixtures = activeEvalFixtures.filter((fixture) => fixture.tags.includes(releaseGateSuitePreset.suiteTag as string));
    } else {
      releaseGatePolicyWarning = "Release gate preset has no fixture selection.";
    }
  }

  const releaseGateFixtureStatuses = releaseGateFixtures.map((fixture) => {
    const latestRun = latestSmokeEvalByFixtureId.get(fixture._id);
    const isCurrent = latestRun ? latestRun.startedAt >= fixture.updatedAt : false;
    const modelGradingSatisfied = !releaseGateRequiresModelGrading || latestRun?.gradingMode === "MODEL_GRADED";
    const passed = Boolean(latestRun && latestRun.status === "SUCCESS" && isCurrent && modelGradingSatisfied);
    return {
      fixtureId: fixture._id,
      type: fixture.type,
      objective: fixture.objective,
      tags: fixture.tags,
      updatedAt: fixture.updatedAt,
      latestRun: latestRun ? {
        runId: latestRun.runId,
        status: latestRun.status,
        gradingMode: latestRun.gradingMode,
        completedAt: latestRun.completedAt ?? latestRun.updatedAt,
        isCurrent,
        modelGradingSatisfied,
      } : null,
      passed,
    };
  });
  const releaseGatePassedCount = releaseGateFixtureStatuses.filter((fixture) => fixture.passed).length;
  const releaseGateStatus: AgentReadinessStatus = releaseGateFixtures.length > 0
    ? releaseGatePassedCount === releaseGateFixtures.length ? "PASS" : "WARN"
    : releaseGateMode === "PRESET" && releaseGatePolicyWarning
    ? "WARN"
    : releaseGateMode === "NONE"
    ? "PASS"
    : !latestSmokeEvalRun || latestSmokeEvalRun.status === "SUCCESS" ? "PASS" : "WARN";

  const checks: Array<{
    key: AgentReadinessCheckKey;
    status: AgentReadinessStatus;
    count?: number;
    latestAt?: number;
  }> = [
    {
      key: "draftStatus",
      status: agent.isActive ? "WARN" : "PASS",
    },
    {
      key: "modelDefault",
      status: modelReadiness.status,
      count: modelReadiness.status === "PASS" ? 1 : 0,
    },
    {
      key: "tools",
      status: toolBindingCount > 0 ? "PASS" : "WARN",
      count: toolBindingCount,
    },
    {
      key: "knowledge",
      status: knowledgeDocumentCount > 0 ? "PASS" : "WARN",
      count: knowledgeDocumentCount,
    },
    {
      key: "evalFixtures",
      status: activeEvalFixtureCount > 0 ? "PASS" : "WARN",
      count: activeEvalFixtureCount,
    },
    {
      key: "smokeEval",
      status: successfulSmokeEvalRunCount > 0 ? "PASS" : "WARN",
      count: successfulSmokeEvalRunCount,
      latestAt: successfulSmokeEvalRuns[0]?.completedAt ?? successfulSmokeEvalRuns[0]?.updatedAt,
    },
    {
      key: "releaseGate",
      status: releaseGateStatus,
      latestAt: latestSmokeEvalRun?.completedAt ?? latestSmokeEvalRun?.updatedAt,
    },
  ];

  const activationWarnings = checks
    .filter((check) => check.status === "WARN")
    .map((check) => check.key);

  return {
    agentId,
    isActive: agent.isActive,
    toolBindingCount,
    knowledgeDocumentCount,
    modelReadiness,
    activeEvalFixtureCount,
    fixtureCoverage,
    successfulSmokeEvalRunCount,
    latestSmokeEvalAt: latestSmokeEvalRun?.completedAt ?? latestSmokeEvalRun?.updatedAt,
    latestSmokeEvalRun: latestSmokeEvalRun ? {
      runId: latestSmokeEvalRun._id,
      objective: latestSmokeEvalRun.objective,
      status: latestSmokeEvalRun.status,
      completedAt: latestSmokeEvalRun.completedAt ?? latestSmokeEvalRun.updatedAt,
      agentVersionId: latestSmokeEvalRun.agentVersionId,
      finalOutput: latestSmokeEvalRun.finalOutput,
      error: latestSmokeEvalRun.error,
    } : null,
    releaseGatePolicy: {
      mode: releaseGateMode,
      requiredTags: releaseGateTags,
      suitePresetId: agent.releaseGateSuitePresetId,
      suitePresetName: releaseGateSuitePreset?.name,
      requiresModelGrading: releaseGateRequiresModelGrading,
      warning: releaseGatePolicyWarning,
      criticalFixtureCount: releaseGateFixtures.length,
      passedCriticalFixtureCount: releaseGatePassedCount,
      blockedCriticalFixtureCount: releaseGateFixtureStatuses.length - releaseGatePassedCount,
      fixtures: releaseGateFixtureStatuses,
    },
    activationRisk: agent.isActive && activationWarnings.length > 0,
    activationWarnings,
    checks,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");

    const allAgents = await ctx.db
      .query("agents")
      .withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined))
      .order("desc")
      .take(AGENT_CATALOG_LIMIT);
    return allAgents.filter(isGlobalAgent);
  },
});

export const getPaginatedAgents = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");

    const searchTerm = args.searchTerm?.trim();
    const result = searchTerm
      ? await ctx.db
        .query("agents")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("agents")
        .withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined))
        .order("desc")
        .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.filter(isGlobalAgent),
    };
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    // We can also fetch populated rules and knowledge documents here if needed
    const populatedRules = agent.ruleIds && agent.ruleIds.length > 0
      ? (await Promise.all(agent.ruleIds.map(id => ctx.db.get(id)))).filter((rule) => rule !== null)
      : [];

    const populatedKnowledge = agent.knowledgeDocumentIds && agent.knowledgeDocumentIds.length > 0
      ? (await Promise.all(agent.knowledgeDocumentIds.map(id => ctx.db.get(id)))).filter((document) => document !== null)
      : [];

    return {
      ...agent,
      populatedRules,
      populatedKnowledge,
    };
  },
});

export const getAgentReadiness = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");
    return await buildAgentReadiness(ctx, args.id);
  },
});

export const createAgent = mutation({
  args: { 
    name: v.string(), 
    description: v.optional(v.string()),
    builderIntent: v.optional(agentBuilderIntentValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const now = Date.now();
    const defaultModelId = await resolveDefaultModelIdForUseCase(ctx, "agent");

    const newAgentId = await ctx.db.insert("agents", buildGlobalAgentRecord({
      name: args.name,
      description: args.description,
      modelId: defaultModelId,
      modelSelectionMode: "inherit",
    }, now));

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: newAgentId,
      timestamp: now,
      metadata: args.builderIntent
        ? JSON.stringify({ name: args.name, scope: "global", builderIntent: args.builderIntent })
        : buildCreateAgentAuditMetadata(args.name)
    });

    return newAgentId;
  },
});

export const getAgentTemplatesForCreation = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");
    return getAgentTemplates();
  },
});

export const createAgentFromTemplate = mutation({
  args: {
    templateId: v.string(),
    name: v.optional(v.string()),
    builderIntent: v.optional(agentBuilderIntentValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const template = getAgentTemplateById(args.templateId);
    if (!template) throw new Error("Agent template not found.");

    const now = Date.now();
    const defaultModelId = await resolveDefaultModelIdForUseCase(ctx, "agent");
    const agentName = args.name?.trim() || template.agentName;

    const newAgentId = await ctx.db.insert("agents", buildGlobalAgentRecord({
      name: agentName,
      description: template.description,
      modelId: defaultModelId,
      modelSelectionMode: "inherit",
      systemPrompt: template.systemPrompt,
      isActive: false,
      temperature: template.temperature,
      humanApprovalRequired: template.humanApprovalRequired,
      reasoningEffort: template.reasoningEffort,
      triggerType: template.triggerType,
    }, now));
    const seededEvalFixtures = await seedFixturesForTemplate({
      ctx,
      agentId: newAgentId,
      createdBy: userId,
      template,
    });
    const recommendedToolBindings = await bindRecommendedTemplateTools(ctx, {
      agentId: newAgentId,
      recommendedToolMappings: template.recommendedToolMappings,
      assignedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: newAgentId,
      timestamp: now,
      metadata: buildCreateAgentFromTemplateAuditMetadata({
        name: agentName,
        templateId: template.id,
        evalFixtureCount: seededEvalFixtures.fixtureIds.length,
        toolBindingCount: recommendedToolBindings.toolBindingCount,
        missingToolMappings: recommendedToolBindings.missingToolMappings,
        builderIntent: args.builderIntent,
      })
    });

    return newAgentId;
  },
});

export const updateAgent = mutation({
  args: { 
    id: v.id("agents"), 
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()),
    modelId: v.optional(v.string()),
    modelSelectionMode: v.optional(v.union(v.literal("inherit"), v.literal("override"))),
    thinkingMode: v.optional(v.boolean()),
    systemPrompt: v.optional(v.string()),
    ruleIds: v.optional(v.array(v.id("aiRules"))),
    knowledgeDocumentIds: v.optional(v.array(v.id("knowledgeDocuments"))),
    isActive: v.optional(v.boolean()),
    reasoningEffort: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    allowInternetAccess: v.optional(v.boolean()),
    storageId: v.optional(v.id("_storage")),
    temperature: v.optional(v.number()),
    humanApprovalRequired: v.optional(v.boolean()),
    inputSchema: v.optional(v.string()),
    outputSchema: v.optional(v.string()),
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    releaseGateMode: v.optional(releaseGateModeValidator),
    releaseGateTags: v.optional(v.array(v.string())),
    releaseGateSuitePresetId: v.optional(v.id("agentEvalSuitePresets")),
    releaseGateRequiresModelGrading: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const { id, storageId, ...updates } = args;
    const existingAgent = await ctx.db.get(id);
    if (!existingAgent) throw new Error("Agent not found");
    const useCase: AgentModelUseCase = existingAgent.workflowId ? "workflow" : "agent";
    const modelSelectionMode: AgentModelSelectionMode | undefined = updates.modelSelectionMode;
    if (updates.releaseGateTags !== undefined) {
      updates.releaseGateTags = normalizeReleaseGateTags(updates.releaseGateTags);
    }
    if (updates.releaseGateMode === "PRESET") {
      if (!updates.releaseGateSuitePresetId && !existingAgent.releaseGateSuitePresetId) {
        throw new Error("Release gate preset is required when preset mode is enabled.");
      }
      const presetId = updates.releaseGateSuitePresetId ?? existingAgent.releaseGateSuitePresetId;
      const preset = presetId ? await ctx.db.get(presetId) : null;
      if (!preset || preset.agentId !== id || preset.status !== "ACTIVE") {
        throw new Error("Release gate preset not found.");
      }
    }
    if (updates.releaseGateMode === "NONE") {
      updates.releaseGateTags = [];
      updates.releaseGateSuitePresetId = undefined;
      updates.releaseGateRequiresModelGrading = false;
    }

    if (updates.isActive === true && existingAgent.isActive === false) {
      const readiness = await buildAgentReadiness(ctx, id);
      if (readiness.successfulSmokeEvalRunCount === 0) {
        throw new Error("Activation blocked: run a successful smoke eval before activating this agent.");
      }
      if (readiness.latestSmokeEvalRun?.status !== "SUCCESS") {
        throw new Error("Activation blocked: latest smoke eval must pass before activating this agent.");
      }
      if (readiness.releaseGatePolicy.blockedCriticalFixtureCount > 0) {
        throw new Error("Activation blocked: critical eval suite must pass before activating this agent.");
      }
      if (readiness.releaseGatePolicy.warning) {
        throw new Error("Activation blocked: release gate policy must be configured before activating this agent.");
      }
    }

    if (modelSelectionMode === "inherit") {
      updates.modelId = await resolveDefaultModelIdForUseCase(ctx, useCase);
    } else if (modelSelectionMode === "override" || updates.modelId !== undefined) {
      updates.modelSelectionMode = "override";
      const targetModelId = updates.modelId ?? existingAgent.modelId;
      await assertModelOverrideAllowed(ctx, { modelId: targetModelId, useCase });
      updates.modelId = targetModelId;
    }
    
    let resolvedAvatarUrl = updates.avatar;
    if (storageId) {
      await validateStoredUpload(ctx, storageId, validateAdminImageMetadata);
      resolvedAvatarUrl = (await ctx.storage.getUrl(storageId)) ?? updates.avatar;
    }

    const now = Date.now();
    await ctx.db.patch(id, buildAgentUpdatePatch({
      updates,
      resolvedAvatarUrl,
      now,
    }));
    
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: id,
      timestamp: now,
      metadata: buildUpdateAgentAuditMetadata({
        updatedFields: Object.keys(updates),
        systemPrompt: updates.systemPrompt,
      })
    });

    return id;
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const agent = await ctx.db.get(args.id);

    // Cleanse tool bindings
    const toolBindings = await ctx.db
       .query("agentTools")
       .withIndex("by_agent", q => q.eq("agentId", args.id))
       .take(AGENT_TOOL_BINDING_LIMIT);
       
    for (const binding of toolBindings) {
        await ctx.db.delete(binding._id);
    }

    await ctx.db.delete(args.id);

    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: args.id,
      timestamp: now,
      metadata: buildDeleteAgentAuditMetadata(agent?.name)
    });

    return true;
  },
});

export const getAgentInternal = internalQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getAgentToolsInternal = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentTools")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .take(AGENT_TOOL_BINDING_LIMIT);
  },
});

export const getForCompanyInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    void args.companyId;
    // Return all agents (for now agents are global, but filtered by isActive)
    return await ctx.db
      .query("agents")
      .withIndex("by_active_created", (q) => q.eq("isActive", true))
      .order("desc")
      .take(AGENT_CATALOG_LIMIT);
  },
});

export const createInlineAgent = mutation({
  args: { 
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const now = Date.now();
    const defaultModelId = await resolveDefaultModelIdForUseCase(ctx, "workflow");

    const newAgentId = await ctx.db.insert("agents", buildInlineAgentRecord({
      workflowId: args.workflowId,
      modelId: defaultModelId,
      modelSelectionMode: "inherit",
    }, now));

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: newAgentId,
      timestamp: now,
      metadata: buildCreateInlineAgentAuditMetadata(args.workflowId)
    });

    return newAgentId;
  },
});

export const promoteToGlobal = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const now = Date.now();

    await ctx.db.patch(args.id, buildPromoteAgentPatch(now));
    
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AGENT",
      actorId: userId,
      entityType: "agents",
      entityId: args.id,
      timestamp: now,
      metadata: buildPromoteAgentAuditMetadata()
    });

    return true;
  },
});
