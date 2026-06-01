import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { requireSuperAdmin } from "./authz";
import { getDefaultModelId } from "./aiModelService";
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");

    const allAgents = await ctx.db.query("agents").order("desc").take(10000);
    return allAgents.filter(isGlobalAgent);
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

    const defaultModels = await ctx.db.query("aiModels").withIndex("by_default", (q) => q.eq("isDefault", true)).take(10000);
    const now = Date.now();

    const newAgentId = await ctx.db.insert("agents", buildGlobalAgentRecord({
      name: args.name,
      description: args.description,
      modelId: getDefaultModelId(defaultModels),
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
    
    let resolvedAvatarUrl = updates.avatar;
    if (storageId) {
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
      metadata: buildUpdateAgentAuditMetadata(Object.keys(updates))
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
       .take(10000);
       
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
      .take(10000);
  },
});

export const getForCompanyInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    void args.companyId;
    // Return all agents (for now agents are global, but filtered by isActive)
    return await ctx.db
      .query("agents")
      .filter(q => q.eq(q.field("isActive"), true))
      .take(10000);
  },
});

export const createInlineAgent = mutation({
  args: { 
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);

    const defaultModels = await ctx.db.query("aiModels").withIndex("by_default", (q) => q.eq("isDefault", true)).take(10000);
    const now = Date.now();

    const newAgentId = await ctx.db.insert("agents", buildInlineAgentRecord({
      workflowId: args.workflowId,
      modelId: getDefaultModelId(defaultModels),
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
