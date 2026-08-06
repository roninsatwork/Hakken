import { assertPurposeAndOwner } from "./agentAccountabilityService";
import {
  autonomyAfterRiskChange,
  describeRiskChange,
  refusalForAutonomy,
  resolveRisk,
  type AgentRiskLevel,
} from "./agentRiskService";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminQuery, superAdminMutation, superAdminQuery } from "./tenantFunctions";
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
import { AGENT_LIMIT_OVERRIDE_FIELDS, clampAgentLimitOverride } from "./agentRuntimeService";
import { clampAgentApprovalExpiryHours } from "./approvalExpiryService";
import { getAgentTemplateById, getAgentTemplates } from "./agentTemplates";
import { seedFixturesForTemplate } from "./agentEvalFixtures";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

const AGENT_CATALOG_LIMIT = 500;
const DEFAULT_MODEL_LIMIT = 10;
const AGENT_TOOL_BINDING_LIMIT = 250;
const TEMPLATE_TOOL_LOOKUP_LIMIT = 250;
const AGENT_READINESS_LOOKBACK_LIMIT = 250;
const SMOKE_EVAL_OBJECTIVE_PREFIX = "Smoke eval:";
const RELEASE_GATE_FIXTURE_TAGS = ["release-gate", "critical"];
type AgentModelSelectionMode = "inherit" | "override";
type AgentModelUseCase = "agent" | "workflow";
type AgentReadinessStatus = "PASS" | "WARN";
type AgentReadinessCheckKey = "draftStatus" | "modelDefault" | "tools" | "skills" | "knowledge" | "evalFixtures" | "smokeEval" | "releaseGate";
type ReleaseGateMode = "TAG" | "PRESET" | "NONE";

/**
 * The checks that can actually stop an agent going live.
 *
 * An agent with no tools bound, no knowledge documents, or still sitting in
 * draft is not broken — those are ordinary designs. An agent that only writes
 * and answers needs no tools; plenty of agents need no documents. Counting
 * absence as a fault put amber warnings on working agents, and worse:
 * `assertReadyForRelease` refuses a release candidate while any warning stands,
 * so a well-built agent that had passed every check written for it could not be
 * released for want of a filing cabinet.
 *
 * A warning is reserved for something set up here that does not work: no model
 * the agent can run on, a skill switched on without the tools it requires,
 * nothing ever proven by a real check, or a must-pass check failing. Absence is
 * never one of them.
 *
 * `evalFixtures` is deliberately absent — an agent with no checks at all cannot
 * have passed one, so `smokeEval` already reports it, and reporting it twice was
 * how one fault became two warnings.
 */
const BLOCKING_READINESS_CHECK_KEYS = new Set<AgentReadinessCheckKey>([
  "modelDefault",
  "skills",
  "smokeEval",
  "releaseGate",
]);
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
  reasoningEffort: v.optional(v.string()),
  includeRecommendedTools: v.optional(v.boolean()),
  smokeEvalRequired: v.optional(v.boolean()),
  readinessAcknowledged: v.optional(v.boolean()),
});

const reasoningEffortValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH")
);

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

function parseSourceEvidenceJson(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getSkillEvidenceFromFixture(fixture: { sourceEvidenceJson: string }) {
  const evidence = parseSourceEvidenceJson(fixture.sourceEvidenceJson);
  return {
    source: typeof evidence.source === "string" ? evidence.source : undefined,
    skillId: typeof evidence.skillId === "string" ? evidence.skillId as Id<"agentSkills"> : undefined,
    skillVersionId: typeof evidence.skillVersionId === "string" ? evidence.skillVersionId as Id<"agentSkillVersions"> : undefined,
  };
}

function parseSkillToolMappings(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
      ))
      : [];
  } catch {
    return [];
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

/**
 * What an agent runs when it has no model of its own.
 *
 * Its own step, so it can be answered for an agent that *is* overriding. The
 * settings screen offers "follow the platform default" as a choice and has to
 * name what that would mean before it is chosen — which a resolution that
 * stops at the override cannot say.
 */
async function resolveInheritedModelForUseCase(ctx: Pick<QueryCtx, "db">, useCase: AgentModelUseCase) {
  const defaultRow = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
    .first();
  const configuredDefault = defaultRow ? await getModelByStableIdForReadiness(ctx, defaultRow.modelId) : null;
  const configuredProviderEnabled = await isProviderEnabledForReadiness(ctx, configuredDefault?.providerKey);
  if (configuredDefault?.isEnabled && modelSupportsUseCase(configuredDefault, useCase) && configuredProviderEnabled) {
    return {
      source: "useCaseDefault" as const,
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
      source: "fallbackDefault" as const,
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
        source: "legacyDefault" as const,
        modelId: legacyModel.modelId,
        providerKey: legacyModel.providerKey,
      };
    }
  }

  return null;
}

async function resolveAgentModelReadiness(ctx: Pick<QueryCtx, "db">, args: {
  agent: {
    modelId: string;
    modelSelectionMode?: AgentModelSelectionMode;
    workflowId?: Id<"workflows">;
  };
}) {
  const useCase: AgentModelUseCase = args.agent.workflowId ? "workflow" : "agent";
  // Resolved either way, so `inheritedModelId` always answers "and what would
  // happen if this agent stopped overriding?".
  const inherited = await resolveInheritedModelForUseCase(ctx, useCase);

  if (args.agent.modelSelectionMode === "override") {
    const overrideModel = await getModelByStableIdForReadiness(ctx, args.agent.modelId);
    const providerEnabled = await isProviderEnabledForReadiness(ctx, overrideModel?.providerKey);
    return {
      status: overrideModel?.isEnabled && modelSupportsUseCase(overrideModel, useCase) && providerEnabled ? "PASS" as const : "WARN" as const,
      source: "override" as const,
      useCase,
      modelId: args.agent.modelId,
      providerKey: overrideModel?.providerKey,
      inheritedModelId: inherited?.modelId,
    };
  }

  if (inherited) {
    return {
      status: "PASS" as const,
      source: inherited.source,
      useCase,
      modelId: inherited.modelId,
      providerKey: inherited.providerKey,
      inheritedModelId: inherited.modelId,
    };
  }

  return {
    status: "WARN" as const,
    source: "missing" as const,
    useCase,
    modelId: args.agent.modelId,
    providerKey: undefined,
    inheritedModelId: undefined,
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

export async function buildAgentReadiness(ctx: Pick<QueryCtx, "db">, agentId: Id<"agents">) {
  const agent = await ctx.db.get(agentId);
  if (!agent) throw new Error("Agent not found");

  const [toolBindings, activeEvalFixtures, recentRuns, skillBindings, allTools] = await Promise.all([
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
    ctx.db
      .query("agentSkillBindings")
      .withIndex("by_agent_enabled", (q) => q.eq("agentId", agentId).eq("isEnabled", true))
      .take(AGENT_TOOL_BINDING_LIMIT),
    ctx.db
      .query("aiTools")
      .withIndex("by_createdAt")
      .order("desc")
      .take(AGENT_TOOL_BINDING_LIMIT),
  ]);
  const activeToolMappings = new Set(allTools
    .filter((tool) => tool.isActive !== false)
    .map((tool) => tool.handlerMapping));
  let skillReadinessRows = await Promise.all(skillBindings.map(async (binding) => {
    const [skill, version] = await Promise.all([
      ctx.db.get(binding.skillId),
      ctx.db.get(binding.skillVersionId),
    ]);
    if (!skill || skill.status !== "ACTIVE") {
      return {
        bindingId: binding._id,
        skillId: binding.skillId,
        skillVersionId: binding.skillVersionId,
        name: skill?.name ?? "Archived skill",
        status: skill?.status ?? "ARCHIVED",
        riskLevel: skill?.riskLevel,
        versionNumber: version?.versionNumber,
        requiredToolMappings: [] as string[],
        missingRequiredToolMappings: ["skill_unavailable"],
        activeEvalFixtureCount: 0,
        latestSkillSmokeEval: null as null | {
          runId: Id<"agentRuns">;
          status: string;
          completedAt?: number;
          isCurrent: boolean;
        },
        skillSmokePassed: false,
      };
    }
    const requiredToolMappings = parseSkillToolMappings(skill.requiredToolMappingsJson);
    return {
      bindingId: binding._id,
      skillId: binding.skillId,
      skillVersionId: binding.skillVersionId,
      name: skill.name,
      status: skill.status,
      riskLevel: skill.riskLevel,
      versionNumber: version?.versionNumber,
      requiredToolMappings,
      missingRequiredToolMappings: requiredToolMappings.filter((mapping) => !activeToolMappings.has(mapping)),
      activeEvalFixtureCount: 0,
      latestSkillSmokeEval: null as null | {
        runId: Id<"agentRuns">;
        status: string;
        completedAt?: number;
        isCurrent: boolean;
      },
      skillSmokePassed: false,
    };
  }));

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
    skillVersionId?: Id<"agentSkillVersions">;
    startedAt: number;
    completedAt?: number;
    updatedAt: number;
  }>();
  for (const record of smokeEvalRecords) {
    const fixtureId = typeof record.metadata.fixtureId === "string" ? record.metadata.fixtureId : undefined;
    if (!fixtureId || latestSmokeEvalByFixtureId.has(fixtureId)) continue;
    const runEvidence = typeof record.metadata.sourceEvidenceJson === "string"
      ? parseSourceEvidenceJson(record.metadata.sourceEvidenceJson)
      : {};
    const runSkillVersionId = typeof runEvidence.skillVersionId === "string"
      ? runEvidence.skillVersionId as Id<"agentSkillVersions">
      : undefined;
    latestSmokeEvalByFixtureId.set(fixtureId, {
      runId: record.run._id,
      status: record.run.status,
      gradingMode: record.metadata.gradingMode === "MODEL_GRADED" ? "MODEL_GRADED" : "CONTRACT_ONLY",
      skillVersionId: runSkillVersionId,
      startedAt: record.run.startedAt,
      completedAt: record.run.completedAt,
      updatedAt: record.run.updatedAt,
    });
  }
  skillReadinessRows = skillReadinessRows.map((row) => {
    const skillFixtures = activeEvalFixtures.filter((fixture) => {
      const evidence = getSkillEvidenceFromFixture(fixture);
      return evidence.source === "agent_skill" && evidence.skillId === row.skillId;
    });
    const latestRuns = skillFixtures
      .map((fixture) => {
        const latestRun = latestSmokeEvalByFixtureId.get(fixture._id);
        const evidence = getSkillEvidenceFromFixture(fixture);
        const isCurrent = latestRun
          ? latestRun.startedAt >= fixture.updatedAt
            && evidence.skillVersionId === row.skillVersionId
            && latestRun.skillVersionId === row.skillVersionId
          : false;
        return latestRun ? {
          ...latestRun,
          fixtureUpdatedAt: fixture.updatedAt,
          isCurrent,
        } : null;
      })
      .filter((run): run is NonNullable<typeof run> => run !== null)
      .toSorted((left, right) => right.startedAt - left.startedAt);
    const latestSkillSmokeEval = latestRuns[0];
    const skillSmokePassed = latestRuns.some((run) => run.status === "SUCCESS" && run.isCurrent);
    return {
      ...row,
      activeEvalFixtureCount: skillFixtures.length,
      latestSkillSmokeEval: latestSkillSmokeEval ? {
        runId: latestSkillSmokeEval.runId,
        status: latestSkillSmokeEval.status,
        completedAt: latestSkillSmokeEval.completedAt ?? latestSkillSmokeEval.updatedAt,
        isCurrent: latestSkillSmokeEval.isCurrent,
      } : null,
      skillSmokePassed,
    };
  });
  const missingRequiredSkillToolCount = skillReadinessRows.reduce(
    (count, row) => count + row.missingRequiredToolMappings.length,
    0
  );
  const missingHighRiskSkillEvalCount = skillReadinessRows.filter((row) =>
    row.riskLevel === "HIGH" && !row.skillSmokePassed
  ).length;
  const missingSkillReadinessIssueCount = missingRequiredSkillToolCount + missingHighRiskSkillEvalCount;
  const knowledgeDocumentCount = agent.knowledgeDocumentIds?.length ?? 0;
  const toolBindingCount = toolBindings.length;
  const activeEvalFixtureCount = activeEvalFixtures.length;
  const successfulSmokeEvalRunCount = successfulSmokeEvalRuns.length;
  /**
   * Successful evals that actually put the objective to a model.
   *
   * A `CONTRACT_ONLY` smoke eval checks configuration — that the rubric is
   * non-empty, the tool mappings are bound, the blocked-actions JSON parses —
   * and then writes a synthetic successful run. It is a useful check and it is
   * not evidence the agent works, because no model was ever called. Counting it
   * towards activation meant an agent could go live having never produced a
   * token.
   */
  const successfulModelGradedEvalCount = successfulSmokeEvalRecords
    .filter((record) => record.metadata.gradingMode === "MODEL_GRADED").length;
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
      key: "skills",
      status: missingSkillReadinessIssueCount === 0 ? "PASS" : "WARN",
      count: skillReadinessRows.length,
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
      // Only a model-graded eval counts as a pass. A configuration check that
      // never called a model is progress, not evidence.
      status: successfulModelGradedEvalCount > 0
        ? "PASS"
        : "WARN",
      count: successfulModelGradedEvalCount,
      latestAt: successfulSmokeEvalRuns[0]?.completedAt ?? successfulSmokeEvalRuns[0]?.updatedAt,
    },
    {
      key: "releaseGate",
      status: releaseGateStatus,
      latestAt: latestSmokeEvalRun?.completedAt ?? latestSmokeEvalRun?.updatedAt,
    },
  ];

  const activationWarnings = checks
    .filter((check) => check.status === "WARN" && BLOCKING_READINESS_CHECK_KEYS.has(check.key))
    .map((check) => check.key);

  return {
    agentId,
    isActive: agent.isActive,
    toolBindingCount,
    knowledgeDocumentCount,
    modelReadiness,
    activeEvalFixtureCount,
    skillReadiness: {
      enabledCount: skillReadinessRows.length,
      missingRequiredToolCount: missingRequiredSkillToolCount,
      missingHighRiskEvalCount: missingHighRiskSkillEvalCount,
      skills: skillReadinessRows,
    },
    fixtureCoverage,
    successfulSmokeEvalRunCount,
    successfulModelGradedEvalCount,
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

export const list = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const allAgents = await ctx.db
      .query("agents")
      .withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined))
      .order("desc")
      .take(AGENT_CATALOG_LIMIT);
    return allAgents.filter(isGlobalAgent);
  },
});

/**
 * What an agent runs when it has not chosen a model, for the list screen.
 *
 * The list draws many rows at once, so it cannot ask per agent — it asks once
 * and applies the answer to every inheriting row. Both jobs are returned
 * because the search path of `getPaginatedAgents` does not filter workflow-backed
 * agents out, and those resolve against the workflow default instead.
 */
export const getInheritedAgentModels = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const describe = async (inherited: Awaited<ReturnType<typeof resolveInheritedModelForUseCase>>) => {
      if (!inherited) return null;
      const model = await getModelByStableIdForReadiness(ctx, inherited.modelId);
      return {
        modelId: inherited.modelId,
        providerKey: inherited.providerKey,
        displayName: model?.friendlyName || model?.displayName || inherited.modelId,
      };
    };

    return {
      agent: await describe(await resolveInheritedModelForUseCase(ctx, "agent")),
      workflow: await describe(await resolveInheritedModelForUseCase(ctx, "workflow")),
    };
  },
});

export const getPaginatedAgents = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

export const get = superAdminQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
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

// Readiness was a superAdminQuery while the evals screen that consumes it is
// reachable by a company admin, so for them it threw and two metric tiles, the
// skill-coverage panel, both blocking banners and the release-policy strip sat on
// a loading state permanently. A large part of that screen had never rendered for
// the people it is built for. A company admin may read readiness for an agent
// belonging to their company, matching how the fixtures on the same screen are
// already scoped.
export const getAgentReadiness = adminQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    if (user.role !== "SUPER_ADMIN") {
      if (!user.companyId || agent.companyId !== user.companyId) {
        throw new Error("Unauthorized");
      }
    }

    return await buildAgentReadiness(ctx, args.id);
  },
});

/**
 * Create an agent, with everything its settings screen would let you set.
 *
 * The create screen used to offer a different, smaller set of choices in a
 * different shape, and most of them were never applied. Anthony, 2026-08-01:
 * *"these are missing and the add has more fields than we need — make it like
 * the edit."* So the two screens now take the same fields, and this mutation
 * accepts what `updateAgent` accepts, applying the same clamps and the same
 * model resolution rather than a second interpretation of them.
 */
export const createAgent = superAdminMutation({
  args: {
    name: v.string(),
    // Both required, though the schema keeps them optional so the assistants
    // that predate the register still validate. Nothing new arrives without a
    // purpose and a person answerable for it.
    description: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    riskLevel: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    avatar: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    modelId: v.optional(v.string()),
    modelSelectionMode: v.optional(v.union(v.literal("inherit"), v.literal("override"))),
    reasoningEffort: v.optional(reasoningEffortValidator),
    allowInternetAccess: v.optional(v.boolean()),
    autonomousToolExecution: v.optional(v.boolean()),
    approvalExpiryHours: v.optional(v.number()),
    maxSteps: v.optional(v.number()),
    maxToolCalls: v.optional(v.number()),
    maxInputTokens: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    builderIntent: v.optional(agentBuilderIntentValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    assertPurposeAndOwner({ purpose: args.description, ownerId: args.ownerId });

    // The rating decides, not the switch. A high-risk assistant created with
    // approval turned off is refused here rather than created and quietly
    // corrected, because the person doing it asked for something the platform
    // will not allow and should be told so.
    const autonomyRefusal = refusalForAutonomy({
      risk: args.riskLevel,
      autonomous: args.autonomousToolExecution,
    });
    if (autonomyRefusal) throw new Error(autonomyRefusal);
    if (args.ownerId && !(await ctx.db.get(args.ownerId))) {
      throw new Error("Choose the person accountable for this.");
    }

    const now = Date.now();

    // Inherit resolves to whatever the platform default is now; an override is
    // checked against the same rule the update path uses, so a model that cannot
    // run an agent is refused here rather than discovered on the first run.
    const modelSelectionMode = args.modelSelectionMode ?? "inherit";
    let modelId: string;
    if (modelSelectionMode === "override" && args.modelId) {
      await assertModelOverrideAllowed(ctx, { modelId: args.modelId, useCase: "agent" });
      modelId = args.modelId;
    } else {
      modelId = await resolveDefaultModelIdForUseCase(ctx, "agent");
    }

    let resolvedAvatarUrl = args.avatar;
    if (args.storageId) {
      await validateStoredUpload(ctx, args.storageId, validateAdminImageMetadata);
      resolvedAvatarUrl = (await ctx.storage.getUrl(args.storageId)) ?? args.avatar;
    }

    // A cleared box arrives as 0 and must mean "follow the platform default",
    // which is an absent field — the same reading the update path gives it.
    const limits = {
      maxSteps: clampAgentLimitOverride("maxSteps", args.maxSteps),
      maxToolCalls: clampAgentLimitOverride("maxToolCalls", args.maxToolCalls),
      maxInputTokens: clampAgentLimitOverride("maxInputTokens", args.maxInputTokens),
      maxRuntimeMs: clampAgentLimitOverride("maxRuntimeMs", args.maxRuntimeMs),
      maxCostGBP: clampAgentLimitOverride("maxCostGBP", args.maxCostGBP),
    };
    const approvalExpiryHours = clampAgentApprovalExpiryHours(args.approvalExpiryHours);

    const newAgentId = await ctx.db.insert("agents", {
      ...buildGlobalAgentRecord({
        name: args.name,
        description: args.description,
        modelId,
        modelSelectionMode,
        // A draft unless asked otherwise. Most agents are worth a look before
        // they can be run, but nothing here refuses to create a live one.
        isActive: args.isActive ?? false,
        ...(args.reasoningEffort ? { reasoningEffort: args.reasoningEffort } : {}),
      }, now),
      ...(args.ownerId ? { ownerId: args.ownerId } : {}),
      ...(args.riskLevel ? { riskLevel: args.riskLevel } : {}),
      ...(resolvedAvatarUrl ? { avatar: resolvedAvatarUrl } : {}),
      ...(args.allowInternetAccess !== undefined
        ? { allowInternetAccess: args.allowInternetAccess }
        : {}),
      // Absent means gated, exactly as the runtime reads it, so only a deliberate
      // true makes a new agent autonomous.
      ...(args.autonomousToolExecution !== undefined
        ? { autonomousToolExecution: args.autonomousToolExecution }
        : {}),
      ...(approvalExpiryHours !== undefined ? { approvalExpiryHours } : {}),
      ...(limits.maxSteps !== undefined ? { maxSteps: limits.maxSteps } : {}),
      ...(limits.maxToolCalls !== undefined ? { maxToolCalls: limits.maxToolCalls } : {}),
      ...(limits.maxInputTokens !== undefined ? { maxInputTokens: limits.maxInputTokens } : {}),
      ...(limits.maxRuntimeMs !== undefined ? { maxRuntimeMs: limits.maxRuntimeMs } : {}),
      ...(limits.maxCostGBP !== undefined ? { maxCostGBP: limits.maxCostGBP } : {}),
    });

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

export const getAgentTemplatesForCreation = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return getAgentTemplates();
  },
});

export const createAgentFromTemplate = superAdminMutation({
  args: {
    templateId: v.string(),
    name: v.optional(v.string()),
    // Overrides the starting point's own level. The create screen pre-fills the
    // control with the template's value, so leaving it alone sends that back.
    reasoningEffort: v.optional(reasoningEffortValidator),
    /**
     * Whether the starting point's suggested tools come with it.
     *
     * Absent means yes, which is what every existing caller expects and what the
     * screen ticks by default. Unticking it now actually skips the binding — the
     * box used to be recorded in the audit trail and ignored, so an agent arrived
     * holding tools its creator had explicitly declined.
     */
    includeRecommendedTools: v.optional(v.boolean()),
    builderIntent: v.optional(agentBuilderIntentValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
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
      reasoningEffort: args.reasoningEffort ?? template.reasoningEffort,
      triggerType: template.triggerType,
    }, now));
    const seededEvalFixtures = await seedFixturesForTemplate({
      ctx,
      agentId: newAgentId,
      createdBy: userId,
      template,
    });
    const recommendedToolBindings = args.includeRecommendedTools === false
      ? { toolBindingCount: 0, missingToolMappings: [] as string[] }
      : await bindRecommendedTemplateTools(ctx, {
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

export const updateAgent = superAdminMutation({
  args: { 
    id: v.id("agents"), 
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    // How the assistants that predate the register get their accountable
    // person. Sending it is optional; clearing one that is already set is not,
    // because a record can be completed and should not be un-completed.
    ownerId: v.optional(v.id("users")),
    riskLevel: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    avatar: v.optional(v.string()),
    modelId: v.optional(v.string()),
    modelSelectionMode: v.optional(v.union(v.literal("inherit"), v.literal("override"))),
    thinkingMode: v.optional(v.boolean()),
    systemPrompt: v.optional(v.string()),
    standingObjective: v.optional(v.string()),
    ruleIds: v.optional(v.array(v.id("aiRules"))),
    knowledgeDocumentIds: v.optional(v.array(v.id("knowledgeDocuments"))),
    isActive: v.optional(v.boolean()),
    reasoningEffort: v.optional(v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"))),
    allowInternetAccess: v.optional(v.boolean()),
    storageId: v.optional(v.id("_storage")),
    temperature: v.optional(v.number()),
    humanApprovalRequired: v.optional(v.boolean()),
    autonomousToolExecution: v.optional(v.boolean()),
    approvalExpiryHours: v.optional(v.number()),
    maxSteps: v.optional(v.number()),
    maxToolCalls: v.optional(v.number()),
    maxInputTokens: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
    inputSchema: v.optional(v.string()),
    outputSchema: v.optional(v.string()),
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    releaseGateMode: v.optional(releaseGateModeValidator),
    releaseGateTags: v.optional(v.array(v.string())),
    releaseGateSuitePresetId: v.optional(v.id("agentEvalSuitePresets")),
    releaseGateRequiresModelGrading: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const { id, storageId, ...updates } = args;
    const existingAgent = await ctx.db.get(id);
    if (!existingAgent) throw new Error("Agent not found");
    if (updates.ownerId !== undefined && !(await ctx.db.get(updates.ownerId))) {
      throw new Error("Choose the person accountable for this.");
    }
    const useCase: AgentModelUseCase = existingAgent.workflowId ? "workflow" : "agent";
    const modelSelectionMode: AgentModelSelectionMode | undefined = updates.modelSelectionMode;
    // Clamp the run budget on the way in, so the stored record says what will
    // actually run rather than holding a number the runtime silently overrides.
    // A field that was sent but is unusable — a cleared box arrives as 0 — becomes
    // undefined, which Convex patches as a removal, restoring the platform
    // default. A field that was not sent at all is left alone.
    for (const field of AGENT_LIMIT_OVERRIDE_FIELDS) {
      if (field in updates) {
        updates[field] = clampAgentLimitOverride(field, updates[field]);
      }
    }
    // Same rule: a cleared box arrives as 0 and becomes a removal, so the agent
    // goes back to following the platform window.
    if ("approvalExpiryHours" in updates) {
      updates.approvalExpiryHours = clampAgentApprovalExpiryHours(updates.approvalExpiryHours);
    }
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

    /**
     * Checks report; they do not decide.
     *
     * Switching an agent on used to be refused outright unless it had run a
     * model-graded eval, passed its latest smoke eval, cleared its critical eval
     * suite and had a release gate configured. Anthony, 2026-08-01: *"i dotn
     * want eval checks on agent to be blocker before goign live."*
     *
     * Nothing is hidden by this — readiness still computes every check and the
     * settings screen still says, beside the switch, what has not been proven.
     * The difference is that it is a warning to read rather than a door to be
     * let through, and whether an untested agent goes live is the operator's
     * call rather than the platform's.
     *
     * Deliberately still enforced elsewhere: an agent has no licence to write
     * without approval unless `autonomousToolExecution` is set, and every run is
     * bounded by its own budget. Those are what stop a live agent doing damage;
     * a passing eval never was.
     */

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

    /**
     * The rating decides what the switch is allowed to say.
     *
     * Two different situations, handled differently on purpose. Asking to run
     * unattended *while* high risk is refused, because the person asked for
     * something the platform will not allow and should be told. Raising an
     * already-unattended assistant to high risk is honoured, and the gate
     * simply closes — that change is the most useful thing a compliance officer
     * can do, and refusing it would punish exactly the right instinct.
     */
    const nextRisk = resolveRisk(updates.riskLevel as AgentRiskLevel | undefined, existingAgent.riskLevel);
    const riskChanged = updates.riskLevel !== undefined && updates.riskLevel !== existingAgent.riskLevel;

    if (updates.autonomousToolExecution === true) {
      const refusal = refusalForAutonomy({ risk: nextRisk, autonomous: true });
      if (refusal) throw new Error(refusal);
    }

    const autonomyNow = updates.autonomousToolExecution ?? existingAgent.autonomousToolExecution;
    const correctedAutonomy = autonomyAfterRiskChange({ risk: nextRisk, autonomous: autonomyNow });
    const gateClosed = correctedAutonomy !== autonomyNow;
    if (gateClosed) {
      updates.autonomousToolExecution = correctedAutonomy;
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

    // Its own record, separate from the field list above. "riskLevel was among
    // the fields updated" does not tell an auditor what it moved from, what it
    // moved to, or that a gate closed as a result — and those are the three
    // things they are looking for.
    if (riskChanged) {
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_AGENT_RISK",
        actorId: userId,
        entityType: "agents",
        entityId: id,
        timestamp: now,
        metadata: JSON.stringify({
          from: existingAgent.riskLevel ?? null,
          to: nextRisk ?? null,
          humanApprovalReinstated: gateClosed,
          summary: describeRiskChange({ from: existingAgent.riskLevel, to: nextRisk, gateClosed }),
        }),
      });
    }

    return id;
  },
});

export const deleteAgent = superAdminMutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const createInlineAgent = superAdminMutation({
  args: { 
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const promoteToGlobal = superAdminMutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const { userId } = ctx;
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
