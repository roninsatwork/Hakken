import { internalQuery, mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

import { getAuthUserId } from "@convex-dev/auth/server";

export const getLatestReport = query({
  args: {},
  handler: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      if (!userId) throw new Error("Unauthenticated request");

      const user = await ctx.db.get(userId);
      if (!user) throw new Error("User not found");

      if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
          throw new Error("Unauthorized: Insufficient privileges to view executive reports.");
      }

      let reports;
      if (user.role !== "SUPER_ADMIN") {
          if (!user.companyId) throw new Error("Unauthorized: Orphaned administrator account.");
          reports = await ctx.db.query("salesReports")
            .withIndex("by_company", q => q.eq("companyId", user.companyId as any))
            .order("desc")
            .take(1);
      } else {
          reports = await ctx.db.query("salesReports")
            .order("desc")
            .take(1);
      }
      return reports[0] || null;
  }
});

export const getAgentQuery = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
      return await ctx.db.get(args.agentId);
  }
});

export const getAgentKnowledgeDocumentsQuery = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
      return await ctx.db.query("knowledgeDocuments")
          .withIndex("by_agent", q => q.eq("agentId", args.agentId))
          .order("desc") // Get newest first
          .take(10000);
  }
});

export const saveGeneratedReport = internalMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    headline: v.string(),
    executiveSummary: v.optional(v.string()),
    kpis: v.any(), 
    closingWindows: v.any(),
    topDeals: v.any(),
    chartData: v.any(),
    pipelineHealth: v.any(),
    riskRadar: v.any(),
    teamSpotlight: v.any(),
    patterns: v.any(),
    priorities: v.any(),
  },
  handler: async (ctx, args) => {
      await ctx.db.insert("salesReports", {
          agentId: args.agentId,
          companyId: args.companyId,
          headline: args.headline,
          executiveSummary: args.executiveSummary,
          kpis: args.kpis,
          closingWindows: args.closingWindows,
          topDeals: args.topDeals,
          chartData: args.chartData,
          pipelineHealth: args.pipelineHealth,
          riskRadar: args.riskRadar,
          teamSpotlight: args.teamSpotlight,
          patterns: args.patterns,
          priorities: args.priorities,
          createdAt: Date.now()
      });
  }
});
