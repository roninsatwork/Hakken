import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Fetch rules based on company context. If companyId is absent, fetches global rules.
export const getRules = query({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return []; 

    const user = await ctx.db.get(userId);
    if (!user) return [];

    if (user.role !== "SUPER_ADMIN") {
        if (args.companyId && args.companyId !== user.companyId) {
            return []; // Unauthorized to view another company's rules
        }
    }

    if (args.agentId) {
       return await ctx.db
        .query("aiRules")
        .withIndex("by_agent", q => q.eq("agentId", args.agentId))
        .order("desc")
        .collect();
    } else if (args.companyId) {
       return await ctx.db
        .query("aiRules")
        .withIndex("by_company_active", q => q.eq("companyId", args.companyId))
        .order("desc")
        .collect();
    } else {
       // Manual filter for undefined companyId & agentId (Global)
       const allRules = await ctx.db.query("aiRules").order("desc").collect();
       return allRules.filter(r => r.companyId === undefined && r.agentId === undefined);
    }
  },
});

export const getActiveRulesInternal = internalQuery({
  args: {
     companyId: v.optional(v.id("companies")),
     agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const activeRules = await ctx.db
      .query("aiRules")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .collect();
      
    // Filter to global rules, company rules, or agent specific rules depending on context
    return activeRules.filter(r => 
        (r.companyId === undefined && r.agentId === undefined) || // Global
        (args.companyId && r.companyId === args.companyId) || // Company Overrides
        (args.agentId && r.agentId === args.agentId) // Agent Overrides
    );
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
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== "SUPER_ADMIN") {
        if (!args.companyId || user.companyId !== args.companyId || user.role !== "ADMIN") {
            throw new Error("Unauthorized: System Protocol creation requires valid permissions.");
        }
    }

    const newRuleId = await ctx.db.insert("aiRules", {
      companyId: args.companyId,
      agentId: args.agentId,
      trigger: args.trigger,
      instruction: args.instruction,
      priority: args.priority,
      isActive: args.isActive,
      createdBy: userId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_AI_RULE",
      actorId: userId,
      entityType: "aiRules",
      entityId: newRuleId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ trigger: args.trigger, scope: args.companyId ? "company" : args.agentId ? "agent" : "global" })
    });

    return newRuleId;
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
    const existingRule = await ctx.db.get(args.id);
    
    if (!user || !existingRule) throw new Error("Entities not found");

    if (user.role !== "SUPER_ADMIN") {
        if (existingRule.companyId !== user.companyId || user.role !== "ADMIN") {
            throw new Error("Unauthorized: System Protocol modification requires valid permissions.");
        }
    }

    await ctx.db.patch(args.id, {
      trigger: args.trigger,
      instruction: args.instruction,
      priority: args.priority,
      isActive: args.isActive,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AI_RULE",
      actorId: userId,
      entityType: "aiRules",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ updatedTrigger: args.trigger, updatedPriority: args.priority })
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
    const existingRule = await ctx.db.get(args.id);
    if (!user || !existingRule) throw new Error("Entities not found");

    if (user.role !== "SUPER_ADMIN") {
       if (existingRule.companyId !== user.companyId || user.role !== "ADMIN") {
           throw new Error("Unauthorized");
       }
    }

    await ctx.db.patch(args.id, { isActive: args.isActive });

    await ctx.db.insert("auditLogs", {
      actionType: "TOGGLE_AI_RULE",
      actorId: userId,
      entityType: "aiRules",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ active: args.isActive })
    });

    return args.id;
  },
});

export const deleteRule = mutation({
  args: { id: v.id("aiRules") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    const existingRule = await ctx.db.get(args.id);
    if (!user || !existingRule) throw new Error("Entities not found");

    if (user.role !== "SUPER_ADMIN") {
        if (existingRule.companyId !== user.companyId || user.role !== "ADMIN") {
            throw new Error("Unauthorized: Sonae architectural deletion prevented.");
        }
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_AI_RULE",
      actorId: userId,
      entityType: "aiRules",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ trigger: existingRule.trigger })
    });

    return true;
  },
});
