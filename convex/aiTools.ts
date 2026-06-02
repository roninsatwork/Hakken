import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getCurrentUser, requireCurrentUser, requireSuperAdmin } from "./authz";

// Fetch all registered AI system tools
export const getTools = query({
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    
    // Tools are strictly globally configured by admins
    return await ctx.db.query("aiTools").order("desc").take(10000);
  },
});

export const getPaginatedTools = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("aiTools")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("aiTools")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const getToolById = query({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");

    return await ctx.db.get(args.id);
  },
});

export const createTool = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    handlerMapping: v.string(),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(
      ctx,
      "Unauthorized: Only Super Admins can register system execution hooks.",
      "Unauthenticated request"
    );

    return await ctx.db.insert("aiTools", {
      name: args.name,
      description: args.description,
      handlerMapping: args.handlerMapping,
      requiredRole: args.requiredRole,
      createdAt: Date.now(),
      createdBy: userId,
    });
  },
});

export const updateTool = mutation({
  args: {
    id: v.id("aiTools"),
    name: v.string(),
    description: v.string(),
    handlerMapping: v.string(),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System modification requires supreme permissions.",
      "Unauthenticated request"
    );

    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      handlerMapping: args.handlerMapping,
      requiredRole: args.requiredRole,
    });
    
    return args.id;
  },
});

export const deleteTool = mutation({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: Sonae architectural deletion prevented.",
      "Unauthenticated request"
    );

    // Must also cleanse all bindings to this tool in the junction table
    const bindings = await ctx.db
       .query("agentTools")
       .withIndex("by_tool", q => q.eq("toolId", args.id))
       .take(10000);
       
    for (const binding of bindings) {
        await ctx.db.delete(binding._id);
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

// Fetch all tool bindings for a specific agent
export const getAgentTools = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const bindings = await ctx.db
       .query("agentTools")
       .withIndex("by_agent", q => q.eq("agentId", args.agentId))
       .take(10000);

    // Map tools
    const tools = [];
    for (const binding of bindings) {
        const tool = await ctx.db.get(binding.toolId);
        if (tool) {
            tools.push({ bindingId: binding._id, ...tool });
        }
    }
    return tools;
  },
});

// Bind or unbind a global tool to an agent
export const toggleAgentTool = mutation({
  args: { 
    agentId: v.id("agents"), 
    toolId: v.id("aiTools"),
    action: v.union(v.literal("BIND"), v.literal("UNBIND"))
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const existingBinding = await ctx.db
       .query("agentTools")
       .withIndex("by_agent", q => q.eq("agentId", args.agentId))
       .filter(q => q.eq(q.field("toolId"), args.toolId))
       .first();

    if (args.action === "BIND" && !existingBinding) {
       await ctx.db.insert("agentTools", {
          agentId: args.agentId,
          toolId: args.toolId,
          assignedAt: Date.now()
       });
    } else if (args.action === "UNBIND" && existingBinding) {
       await ctx.db.delete(existingBinding._id);
    }
    
    return true;
  },
});

export const getToolInternal = internalQuery({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
