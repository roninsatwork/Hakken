import type { Doc, Id } from "./_generated/dataModel";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";

export function isGlobalAgent(agent: Doc<"agents">) {
  return agent.isGlobal !== false;
}

export function buildGlobalAgentRecord(args: {
  name: string;
  description?: string;
  modelId: string;
  modelSelectionMode?: "inherit" | "override";
  systemPrompt?: string;
  isActive?: boolean;
  temperature?: number;
  humanApprovalRequired?: boolean;
  reasoningEffort?: "LOW" | "MEDIUM" | "HIGH";
  triggerType?: "MANUAL" | "WEBHOOK" | "SCHEDULE";
}, now = Date.now()) {
  return {
    name: args.name,
    description: args.description,
    modelId: args.modelId,
    modelSelectionMode: args.modelSelectionMode ?? "inherit",
    thinkingMode: false,
    systemPrompt: args.systemPrompt,
    isActive: args.isActive ?? true,
    temperature: args.temperature ?? 1.0,
    humanApprovalRequired: args.humanApprovalRequired ?? false,
    reasoningEffort: args.reasoningEffort,
    triggerType: args.triggerType,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildInlineAgentRecord(args: {
  workflowId: Id<"workflows">;
  modelId: string;
  modelSelectionMode?: "inherit" | "override";
}, now = Date.now()) {
  return {
    name: "Sandbox Agent",
    description: "Inline agent logic",
    modelId: args.modelId,
    modelSelectionMode: args.modelSelectionMode ?? "inherit",
    thinkingMode: false,
    isActive: true,
    temperature: 1.0,
    humanApprovalRequired: false,
    isGlobal: false,
    workflowId: args.workflowId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildAgentUpdatePatch<T extends Record<string, unknown>>(args: {
  updates: T;
  resolvedAvatarUrl?: string;
  now?: number;
}) {
  return {
    ...args.updates,
    ...(args.resolvedAvatarUrl !== undefined ? { avatar: args.resolvedAvatarUrl } : {}),
    updatedAt: args.now ?? Date.now(),
  };
}

export function buildPromoteAgentPatch(now = Date.now()) {
  return {
    isGlobal: true,
    workflowId: undefined,
    updatedAt: now,
  };
}

export function buildCreateAgentAuditMetadata(name: string) {
  return JSON.stringify({ name, scope: "global" });
}

/**
 * `approvalPolicy`, `modelBehavior` and `knowledgePlan` are gone from here.
 *
 * All three were the same fault. The agent builder offered a choice, serialised it
 * into this metadata, and nothing ever read it back — so choosing "always require
 * approval" never made an agent require approval, and choosing "more thorough"
 * never made one think harder. Anthony, 2026-08-01, reading the create screen
 * beside the settings screen: *"there is massive inconsistencies between the edit
 * and the add ... the add is terrible."* The controls were the inconsistency.
 *
 * Each is now either real or gone. Approval is a switch on agent settings that
 * writes `autonomousToolExecution`. Thinking depth is `reasoningEffort`, chosen at
 * creation with the same three levels and the same words the settings screen uses.
 * Suggested documents were never a thing at all — no template carries any — so the
 * control was removed rather than wired.
 *
 * `toolPlan` survives as `includeRecommendedTools`, an argument that actually skips
 * the binding. Existing audit rows keep their stored copies; nothing reads them back.
 */
export type AgentBuilderIntentAuditMetadata = {
  objective?: string;
  audience?: string;
  reasoningEffort?: string;
  includeRecommendedTools?: boolean;
  smokeEvalRequired?: boolean;
  readinessAcknowledged?: boolean;
};

function normalizeBuilderIntentAuditMetadata(intent?: AgentBuilderIntentAuditMetadata) {
  if (!intent) return undefined;

  return {
    ...(intent.objective ? { objective: intent.objective.slice(0, 500) } : {}),
    ...(intent.audience ? { audience: intent.audience.slice(0, 160) } : {}),
    ...(intent.reasoningEffort ? { reasoningEffort: intent.reasoningEffort } : {}),
    ...(intent.includeRecommendedTools !== undefined
      ? { includeRecommendedTools: intent.includeRecommendedTools }
      : {}),
    ...(intent.smokeEvalRequired !== undefined ? { smokeEvalRequired: intent.smokeEvalRequired } : {}),
    ...(intent.readinessAcknowledged !== undefined ? { readinessAcknowledged: intent.readinessAcknowledged } : {}),
  };
}

export function buildCreateAgentFromTemplateAuditMetadata(args: {
  name: string;
  templateId: string;
  evalFixtureCount?: number;
  toolBindingCount?: number;
  missingToolMappings?: string[];
  builderIntent?: AgentBuilderIntentAuditMetadata;
}) {
  return JSON.stringify({
    name: args.name,
    scope: "global",
    templateId: args.templateId,
    ...(args.evalFixtureCount !== undefined ? { evalFixtureCount: args.evalFixtureCount } : {}),
    ...(args.toolBindingCount !== undefined ? { toolBindingCount: args.toolBindingCount } : {}),
    ...(args.missingToolMappings !== undefined ? { missingToolMappings: args.missingToolMappings } : {}),
    ...(args.builderIntent ? { builderIntent: normalizeBuilderIntentAuditMetadata(args.builderIntent) } : {}),
  });
}

export function buildUpdateAgentAuditMetadata(args: { updatedFields: string[]; systemPrompt?: string } | string[]) {
  const updatedFields = Array.isArray(args) ? args : args.updatedFields;
  const systemPrompt = Array.isArray(args) ? undefined : args.systemPrompt;
  const safetyWarnings =
    typeof systemPrompt === "string"
      ? getAssistantSafetyWarnings(systemPrompt).map((warning) => warning.category)
      : [];

  return JSON.stringify({
    updatedFields,
    ...(safetyWarnings.length > 0 ? { safetyWarnings } : {}),
  });
}

export function buildDeleteAgentAuditMetadata(name?: string) {
  return JSON.stringify({ name });
}

export function buildCreateInlineAgentAuditMetadata(workflowId: Id<"workflows">) {
  return JSON.stringify({ scope: "inline_workflow", workflowId });
}

export function buildPromoteAgentAuditMetadata() {
  return JSON.stringify({ action: "promoted_to_global" });
}
