import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

    return await ctx.db.query("workflows").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated Admin Request");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");

    return workflow;
  },
});

export const createWorkflow = mutation({
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

    return await ctx.db.insert("workflows", {
      name: args.name,
      description: args.description,
      isActive: true,
      triggerType: "MANUAL",
      nodes: "[]",
      edges: "[]",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
    });
  },
});

export const updateWorkflow = mutation({
  args: { 
    id: v.id("workflows"), 
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    nodes: v.optional(v.string()),
    edges: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const { id, ...updates } = args;
    
    await ctx.db.patch(id, { 
      ...updates,
      updatedAt: Date.now()
    });
    
    return id;
  },
});

export const deleteWorkflow = mutation({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});
