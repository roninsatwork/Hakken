import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated Admin Request");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

    const allAgents = await ctx.db.query("agents").order("desc").take(10000);
    return allAgents.filter(a => a.isGlobal !== false);
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated Admin Request");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const agent = await ctx.db.get(args.id);
    if (!agent) throw new Error("Agent not found");

    // We can also fetch populated rules and knowledge documents here if needed
    let populatedRules: any[] = [];
    if (agent.ruleIds && agent.ruleIds.length > 0) {
      populatedRules = await Promise.all(agent.ruleIds.map(id => ctx.db.get(id)));
    }

    let populatedKnowledge: any[] = [];
    if (agent.knowledgeDocumentIds && agent.knowledgeDocumentIds.length > 0) {
      populatedKnowledge = await Promise.all(agent.knowledgeDocumentIds.map(id => ctx.db.get(id)));
    }

    return {
      ...agent,
      populatedRules: populatedRules.filter(Boolean),
      populatedKnowledge: populatedKnowledge.filter(Boolean),
    };
  },
});

export const createAgent = mutation({
  args: { 
    name: v.string(), 
    description: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const defaultModel = await ctx.db.query("aiModels").withIndex("by_default", (q) => q.eq("isDefault", true)).first();

    const newAgentId = await ctx.db.insert("agents", {
      name: args.name,
      description: args.description,
      modelId: defaultModel?.modelId || "gemini-2.5-flash", // securely extract default or fallback
      thinkingMode: false,
      isActive: true, // defaults to true
      temperature: 1.0, // Default deterministic score
      humanApprovalRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT",
      actorId: userId as any,
      entityType: "agents",
      entityId: newAgentId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ name: args.name, scope: "global" })
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const { id, storageId, ...updates } = args;
    
    let resolvedAvatarUrl = updates.avatar;
    if (storageId) {
      resolvedAvatarUrl = (await ctx.storage.getUrl(storageId)) ?? updates.avatar;
    }
    
    await ctx.db.patch(id, { 
      ...updates,
      ...(resolvedAvatarUrl !== undefined && { avatar: resolvedAvatarUrl }),
      updatedAt: Date.now()
    });
    
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AGENT",
      actorId: userId as any,
      entityType: "agents",
      entityId: id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ updatedFields: Object.keys(updates) })
    });

    return id;
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

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

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_AGENT",
      actorId: userId as any,
      entityType: "agents",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ name: agent?.name })
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const defaultModel = await ctx.db.query("aiModels").withIndex("by_default", (q) => q.eq("isDefault", true)).first();

    const newAgentId = await ctx.db.insert("agents", {
      name: "Sandbox Agent",
      description: "Inline agent logic",
      modelId: defaultModel?.modelId || "gemini-2.5-flash", // securely extract default or fallback
      thinkingMode: false,
      isActive: true, // defaults to true
      temperature: 1.0,
      humanApprovalRequired: false,
      isGlobal: false,
      workflowId: args.workflowId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AGENT",
      actorId: userId as any,
      entityType: "agents",
      entityId: newAgentId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ scope: "inline_workflow", workflowId: args.workflowId })
    });

    return newAgentId;
  },
});

export const promoteToGlobal = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      isGlobal: true,
      workflowId: undefined, // remove association
      updatedAt: Date.now()
    });
    
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AGENT",
      actorId: userId as any,
      entityType: "agents",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ action: "promoted_to_global" })
    });

    return true;
  },
});
