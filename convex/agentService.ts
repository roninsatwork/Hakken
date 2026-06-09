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
}, now = Date.now()) {
  return {
    name: args.name,
    description: args.description,
    modelId: args.modelId,
    modelSelectionMode: args.modelSelectionMode ?? "inherit",
    thinkingMode: false,
    isActive: true,
    temperature: 1.0,
    humanApprovalRequired: false,
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
