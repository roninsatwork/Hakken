import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getWidgetsByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    // Verify user belongs to this company
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN" && user?.companyId !== args.companyId) {
      throw new Error("Unauthorized Access");
    }

    return await ctx.db
      .query("widgets")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const getGlobalWidgets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized Access");
    }

    return await ctx.db
      .query("widgets")
      .withIndex("by_global", (q) => q.eq("isGlobal", true))
      .collect();
  },
});

export const getWidgetById = query({
  args: { widgetId: v.id("widgets") },
  handler: async (ctx, args) => {
    // PUBLIC endpoint for the iframe (no auth required here to load config, but we omit sensitive data)
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) return null;

    // Load agent info for avatar
    let agentAvatar = null;
    if (widget.agentId) {
       const agent = await ctx.db.get(widget.agentId);
       if (agent) agentAvatar = agent.avatar; 
    }

    return {
      _id: widget._id,
      name: widget.name,
      companyId: widget.companyId,
      agentId: widget.agentId,
      allowedDomains: widget.allowedDomains,
      themePrimaryColor: widget.themePrimaryColor,
      themeGreeting: widget.themeGreeting,
      agentAvatar: agentAvatar,
    };
  },
});

export const saveWidget = mutation({
  args: {
    widgetId: v.optional(v.id("widgets")),
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
    allowedDomains: v.array(v.string()),
    themePrimaryColor: v.optional(v.string()),
    themeGreeting: v.optional(v.string()),
    isActive: v.boolean(),
    isGlobal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    
    if (user?.role !== "SUPER_ADMIN") {
      if (args.isGlobal || !args.companyId) {
        throw new Error("Unauthorized: Only Super Admins can manage global widgets.");
      }
      if (user?.companyId !== args.companyId) {
        throw new Error("Unauthorized");
      }
    }

    const now = Date.now();

    if (args.widgetId) {
      // Update
      const existing = await ctx.db.get(args.widgetId);
      if (!existing) throw new Error("Widget not found");
      if (user?.role !== "SUPER_ADMIN" && existing.companyId !== args.companyId) throw new Error("Widget not found");
      
      await ctx.db.patch(args.widgetId, {
        name: args.name,
        agentId: args.agentId,
        allowedDomains: args.allowedDomains,
        themePrimaryColor: args.themePrimaryColor,
        themeGreeting: args.themeGreeting,
        isActive: args.isActive,
        isGlobal: args.isGlobal,
      });

      // Audit Log
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "UPDATE_WIDGET",
        entityId: args.widgetId,
        entityType: "widgets",
        companyId: args.companyId,
        timestamp: now,
      });

      return args.widgetId;
    } else {
      // Create
      const newId = await ctx.db.insert("widgets", {
        companyId: args.companyId,
        name: args.name,
        agentId: args.agentId,
        allowedDomains: args.allowedDomains,
        themePrimaryColor: args.themePrimaryColor,
        themeGreeting: args.themeGreeting,
        isActive: args.isActive,
        isGlobal: args.isGlobal,
        createdBy: userId,
        createdAt: now,
      });

      // Audit Log
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "CREATE_WIDGET",
        entityId: newId,
        entityType: "widgets",
        companyId: args.companyId,
        timestamp: now,
      });

      return newId;
    }
  },
});

export const deleteWidget = mutation({
  args: {
    widgetId: v.id("widgets"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    const widget = await ctx.db.get(args.widgetId);
    
    if (!widget) throw new Error("Widget not found");

    if (user?.role !== "SUPER_ADMIN") {
      if (widget.isGlobal || widget.companyId !== user?.companyId || args.companyId !== user?.companyId) {
        throw new Error("Unauthorized");
      }
    }

    await ctx.db.delete(args.widgetId);

    // Audit Log
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DELETE_WIDGET",
      entityId: args.widgetId,
      entityType: "widgets",
      companyId: args.companyId,
      timestamp: Date.now(),
    });

    return true;
  },
});

// Specialized thread creator for anonymous widget interactions
export const createWidgetThread = mutation({
  args: {
    widgetId: v.id("widgets"),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized"); // Even anonymous users get a userId via Convex Auth
    }
    
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive) throw new Error("Invalid or inactive Widget");

    const now = Date.now();
    
    const threadId = await ctx.db.insert("threads", {
      userId,
      companyId: widget.companyId,
      agentId: widget.agentId,
      widgetId: args.widgetId,
      sourceUrl: args.sourceUrl,
      title: "Widget Interaction",
      createdAt: now,
      updatedAt: now,
    });

    return threadId;
  },
});
