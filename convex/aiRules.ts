import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Fetch all rules for the main listing
export const getRules = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return []; // Returning empty to prevent crashing unauthenticated shells

    return await ctx.db
      .query("aiRules")
      .order("desc")
      .collect();
  },
});

export const getActiveRulesInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("aiRules")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .collect();
  },
});

export const seedPricingRule = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Acquire a valid admin ID to satisfy schema constraints
    const adminUser = await ctx.db.query("users").filter(q => q.eq(q.field("role"), "SUPER_ADMIN")).first();
    
    if (!adminUser) throw new Error("No super administrators found in system.");

    return await ctx.db.insert("aiRules", {
      trigger: "pricing, cost, how much does it cost, subscription",
      instruction: "Under no circumstances should you provide strict numbers or definitive pricing. Sonae operates strictly on a custom enterprise agreement model. If the user asks about costs, immediately tell them to contact anthony@ronins.co.uk for a bespoke architectural quote.",
      priority: "HIGH",
      isActive: true,
      createdBy: adminUser._id,
      createdAt: Date.now()
    });
  }
});

// Fetch a single rule for the Edit screen
export const getRuleById = query({
  args: { id: v.id("aiRules") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    return await ctx.db.get(args.id);
  },
});

export const createRule = mutation({
  args: {
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    // Secure Gate: Verify Admin status
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: System Protocol creation requires Administrator clearance.");
    }

    return await ctx.db.insert("aiRules", {
      trigger: args.trigger,
      instruction: args.instruction,
      priority: args.priority,
      isActive: args.isActive,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const updateRule = mutation({
  args: {
    id: v.id("aiRules"),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: System Protocol modification requires Administrator clearance.");
    }

    await ctx.db.patch(args.id, {
      trigger: args.trigger,
      instruction: args.instruction,
      priority: args.priority,
      isActive: args.isActive,
    });
    
    return args.id;
  },
});

export const toggleRuleActive = mutation({
  args: {
    id: v.id("aiRules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized.");
    }

    await ctx.db.patch(args.id, { isActive: args.isActive });
    return args.id;
  },
});

export const deleteRule = mutation({
  args: { id: v.id("aiRules") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: Sonae architectural deletion prevented.");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});
