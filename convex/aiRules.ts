import { internalQuery, internalMutation } from "./_generated/server";
import schema from "./schema";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  assertAdminCanAccessCompany,
  canAccessCompany,
  getCurrentUser,
  } from "./authz";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";
import { DEFAULT_SETTINGS } from "./settingsService";
import { publicQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

function uniqueRulesById(rules: Doc<"aiRules">[]) {
  const seen = new Set<string>();

  return rules.filter((rule) => {
    if (seen.has(rule._id)) return false;
    seen.add(rule._id);
    return true;
  });
}

function getRuleSafetyWarningCategories(args: { trigger: string; instruction: string }) {
  const warnings = getAssistantSafetyWarnings(`${args.trigger}\n${args.instruction}`);
  return [...new Set(warnings.map((warning) => warning.category))];
}

function buildRuleAuditMetadata(metadata: Record<string, unknown>, args: { trigger: string; instruction: string }) {
  const safetyWarnings = getRuleSafetyWarningCategories(args);
  return JSON.stringify({
    ...metadata,
    ...(safetyWarnings.length > 0 ? { safetyWarnings } : {}),
  });
}

// Fetch rules based on company context. If companyId is absent, fetches global rules.
export const getRules = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  returns: v.array(v.object({ _id: v.id("aiRules"), _creationTime: v.number(), ...schema.tables.aiRules.validator.fields })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    const { user } = current;

    if (user.role !== "SUPER_ADMIN") {
        if (args.companyId && !canAccessCompany(user, args.companyId)) {
            return []; // Unauthorized to view another company's rules
        }
    }

    if (args.agentId) {
       // Agents are global. But an ADMIN can only see rules for an agent if the rule ALSO has their companyId.
       if (user.role === "ADMIN") {
           return await ctx.db
            .query("aiRules")
            .withIndex("by_agent_company_created", q => q.eq("agentId", args.agentId).eq("companyId", user.companyId))
            .order("desc")
            .take(100);
       }

       return await ctx.db
        .query("aiRules")
        .withIndex("by_agent", q => q.eq("agentId", args.agentId))
        .order("desc")
        .take(100);
    } else if (args.companyId) {
       return await ctx.db
        .query("aiRules")
        .withIndex("by_company_created", q => q.eq("companyId", args.companyId))
        .order("desc")
        .take(100);
    } else {
       if (user.role !== "SUPER_ADMIN") return [];

       // Manual filter for undefined companyId & agentId (Global)
       return await ctx.db
         .query("aiRules")
         .withIndex("by_global_created", q => q.eq("companyId", undefined).eq("agentId", undefined))
         .order("desc")
         .take(100);
    }
  },
});

export const getOffsetPaginatedRules = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({ data: v.array(v.object({ _id: v.id("aiRules"), _creationTime: v.number(), ...schema.tables.aiRules.validator.fields })), totalCount: v.number(), totalPages: v.number() }),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return { data: [], totalCount: 0, totalPages: 1 };
    const { user } = current;

    if (user.role !== "SUPER_ADMIN") {
        if (args.companyId && !canAccessCompany(user, args.companyId)) {
            return { data: [], totalCount: 0, totalPages: 1 };
        }
    }

    let rawResults: Doc<"aiRules">[] = [];

    if (args.agentId) {
       if (user.role === "ADMIN") {
           rawResults = await ctx.db
            .query("aiRules")
            .withIndex("by_agent_company_created", q => q.eq("agentId", args.agentId).eq("companyId", user.companyId))
            .order("desc")
            .take(1000);
       } else {
           rawResults = await ctx.db
            .query("aiRules")
            .withIndex("by_agent", q => q.eq("agentId", args.agentId))
            .order("desc")
            .take(1000); // UI performance cap limit
       }
    } else if (args.companyId) {
       rawResults = await ctx.db
        .query("aiRules")
        .withIndex("by_company_created", q => q.eq("companyId", args.companyId))
        .order("desc")
        .take(1000);
    } else {
       if (user.role !== "SUPER_ADMIN") return { data: [], totalCount: 0, totalPages: 1 };

       // Global
       rawResults = await ctx.db
         .query("aiRules")
         .withIndex("by_global_created", q => q.eq("companyId", undefined).eq("agentId", undefined))
         .order("desc")
         .take(1000);
    }

    const term = normalizeSearchTerm(args.searchTerm);
    if (term) {
       rawResults = rawResults.filter(r => 
           includesSearchTerm(r.name, term) ||
           includesSearchTerm(r.trigger, term) ||
           includesSearchTerm(r.instruction, term)
       );
    }

    const page = paginateItems(rawResults, args.page, args.pageSize);

    return {
      data: page.data,
      totalCount: page.totalCount,
      totalPages: page.totalPages,
    };
  },
});

export const getActiveRulesInternal = internalQuery({
  args: {
     companyId: v.optional(v.id("companies")),
     agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const globalRules = await ctx.db
      .query("aiRules")
      .withIndex("by_global_active_created", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("isActive", true))
      .order("desc")
      .take(1000);
    const companyRules = args.companyId
      ? await ctx.db
        .query("aiRules")
        .withIndex("by_company_active_created", (q) => q.eq("companyId", args.companyId).eq("isActive", true))
        .order("desc")
        .take(1000)
      : [];
    const agentRules = args.agentId
      ? await ctx.db
        .query("aiRules")
        .withIndex("by_agent_active_created", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
        .order("desc")
        .take(1000)
      : [];

    return uniqueRulesById([...globalRules, ...companyRules, ...agentRules]);
  },
});

/**
 * Compose the seeded pricing-protocol instruction from deployment settings.
 *
 * This previously hardcoded both the platform name and a specific person's
 * email address, so every fork and every customer deployment shipped an agent
 * that routed pricing enquiries to the original author. The referral sentence
 * is emitted only when a sales contact is actually configured; the
 * do-not-quote-prices instruction stands on its own without it.
 */
export function buildPricingProtocolInstruction(args: {
  platformName?: string;
  salesContactEmail?: string;
}) {
  const platformName = args.platformName?.trim() || DEFAULT_SETTINGS.platformName;
  const salesContactEmail = args.salesContactEmail?.trim();

  const instruction =
    "Under no circumstances should you provide strict numbers or definitive pricing. " +
    `${platformName} operates strictly on a custom enterprise agreement model.`;

  return salesContactEmail
    ? `${instruction} If the user asks about costs, immediately tell them to contact ${salesContactEmail} for a bespoke architectural quote.`
    : `${instruction} If the user asks about costs, tell them that a member of the team will follow up with a bespoke quote.`;
}

export const seedPricingRule = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Acquire a valid admin ID to satisfy schema constraints
    const adminUser = await ctx.db.query("users").filter(q => q.eq(q.field("role"), "SUPER_ADMIN")).first();

    if (!adminUser) throw appError("NOT_FOUND", "No super administrators found in system.");

    const settings = await ctx.db.query("systemSettings").first();

    return await ctx.db.insert("aiRules", {
      name: "Pricing Protocol",
      trigger: "pricing, cost, how much does it cost, subscription",
      instruction: buildPricingProtocolInstruction({
        platformName: settings?.platformName,
        salesContactEmail: settings?.salesContactEmail,
      }),
      priority: "HIGH",
      isActive: true,
      createdBy: adminUser._id,
      createdAt: Date.now()
    });
  }
});

// Fetch a single rule for the Edit screen
export const getRuleById = tenantQuery({
  args: { id: v.id("aiRules") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const rule = await ctx.db.get(args.id);
    
    if (!rule) return null;

    if (user.role !== "SUPER_ADMIN") {
        if (rule.companyId && !canAccessCompany(user, rule.companyId)) {
            throw appError("UNAUTHORIZED", "Unauthorized");
        }
        // If it's a global rule (no companyId), only SUPER_ADMIN can view it in the admin panel
        if (!rule.companyId && !rule.agentId) {
             throw appError("UNAUTHORIZED", "Unauthorized");
        }
        // If it's an agent rule, we must ensure the agent belongs to the user's company
        if (rule.agentId) {
             // Agents are global, but if the rule is scoped to an agent AND a company, we verified company above.
             // If the rule is scoped to an agent but NOT a company, it's a global agent rule, so throw.
             if (!rule.companyId) {
                 throw appError("UNAUTHORIZED", "Unauthorized");
             }
        }
    }

    return rule;
  },
});

export const createRule = tenantMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    name: v.string(),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    if (user.role !== "SUPER_ADMIN" && args.agentId) {
       // Agents are global in Sonae. If an ADMIN creates a rule for an agent,
       // it must still be strictly scoped by their companyId.
    }
    assertAdminCanAccessCompany(user, args.companyId, "Unauthorized: System Protocol creation requires valid permissions.");

    const newRuleId = await ctx.db.insert("aiRules", {
      name: args.name,
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
      metadata: buildRuleAuditMetadata(
        { trigger: args.trigger, scope: args.companyId ? "company" : args.agentId ? "agent" : "global" },
        { trigger: args.trigger, instruction: args.instruction }
      )
    });

    return newRuleId;
  },
});

export const updateRule = tenantMutation({
  args: {
    id: v.id("aiRules"),
    name: v.string(),
    trigger: v.string(),
    instruction: v.string(),
    priority: v.union(v.literal("LOW"), v.literal("NORMAL"), v.literal("HIGH"), v.literal("CRITICAL")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const existingRule = await ctx.db.get(args.id);
    
    if (!existingRule) throw appError("NOT_FOUND", "Entities not found");
    assertAdminCanAccessCompany(user, existingRule.companyId, "Unauthorized: System Protocol modification requires valid permissions.");

    await ctx.db.patch(args.id, {
      name: args.name,
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
      metadata: buildRuleAuditMetadata(
        { updatedTrigger: args.trigger, updatedPriority: args.priority },
        { trigger: args.trigger, instruction: args.instruction }
      )
    });
    
    return args.id;
  },
});

export const toggleRuleActive = tenantMutation({
  args: {
    id: v.id("aiRules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const existingRule = await ctx.db.get(args.id);
    if (!existingRule) throw appError("NOT_FOUND", "Entities not found");
    assertAdminCanAccessCompany(user, existingRule.companyId);

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

export const deleteRule = tenantMutation({
  args: { id: v.id("aiRules") },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const existingRule = await ctx.db.get(args.id);
    if (!existingRule) throw appError("NOT_FOUND", "Entities not found");
    assertAdminCanAccessCompany(user, existingRule.companyId, "Unauthorized: architectural deletion prevented.");

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
