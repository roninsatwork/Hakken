import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireSuperAdmin } from "./authz";
import { SYSTEM_FAILSAFE_MODEL_ID, getDefaultModelId } from "./aiModelService";
import {
  buildAgentUpdatePatch,
  buildCreateAgentAuditMetadata,
  buildCreateInlineAgentAuditMetadata,
  buildDeleteAgentAuditMetadata,
  buildGlobalAgentRecord,
  buildInlineAgentRecord,
  buildPromoteAgentAuditMetadata,
  buildPromoteAgentPatch,
  buildUpdateAgentAuditMetadata,
  isGlobalAgent,
} from "./agentService";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

const AGENT_CATALOG_LIMIT = 500;
const DEFAULT_MODEL_LIMIT = 10;
const AGENT_TOOL_BINDING_LIMIT = 250;
type AgentModelSelectionMode = "inherit" | "override";
type AgentModelUseCase = "agent" | "workflow";

async function getModelByStableId(ctx: MutationCtx, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

function modelSupportsUseCase(model: { supportedUseCases?: string[] }, useCase: AgentModelUseCase) {
  return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
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

export const createAgent = mutation({
  args: { 
    name: v.string(), 
    description: v.optional(v.string()) 
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
      metadata: buildCreateAgentAuditMetadata(args.name)
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
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const { id, storageId, ...updates } = args;
    const existingAgent = await ctx.db.get(id);
    if (!existingAgent) throw new Error("Agent not found");
    const useCase: AgentModelUseCase = existingAgent.workflowId ? "workflow" : "agent";
    const modelSelectionMode: AgentModelSelectionMode | undefined = updates.modelSelectionMode;

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
