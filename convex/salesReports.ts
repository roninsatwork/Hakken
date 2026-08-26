import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { moduleQuery } from "./tenantFunctions";
import { REPORTS_MODULE_KEY } from "./utils/coreModules";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";

/** One named person in a spotlight or risk line, as the board report writes them. */
const dealAtRiskValidator = v.object({
  dealName: v.string(),
  rep: v.string(),
  value: v.number(),
  reason: v.string(),
  recommendation: v.string(),
});

const repSummaryValidator = v.union(
  v.string(),
  v.array(v.object({ rep: v.string(), summary: v.string() }))
);

/**
 * The eleven sections the board screen renders, and no more.
 *
 * The whole row used to leave. That carried `chartData` — a funnel, a
 * timeline and a source breakdown the screen has never drawn — and
 * `riskTables`, a legacy `v.any()` blob of whatever an older prompt
 * produced, out to every reader. It also carried `agentId`, naming which
 * agent wrote the report, which is provenance for the audit trail rather
 * than something a board page needs. All four stay on the server.
 */
const boardReportValidator = v.object({
  headline: v.string(),
  executiveSummary: v.optional(v.string()),
  markdownReport: v.optional(v.string()),
  kpis: v.object({
    totalPipeline: v.number(),
    totalPipelineChange: v.optional(v.string()),
    weightedPipeline: v.number(),
    weightedPipelineChange: v.optional(v.string()),
    openDeals: v.number(),
    openDealsChange: v.optional(v.string()),
    winRatePct: v.number(),
    winRatePctChange: v.optional(v.string()),
    avgDealSize: v.optional(v.number()),
    avgDealSizeChange: v.optional(v.string()),
    avgSalesCycleDays: v.optional(v.number()),
    avgSalesCycleDaysChange: v.optional(v.string()),
  }),
  closingWindows: v.optional(
    v.array(
      v.object({
        window: v.string(),
        deals: v.number(),
        totalValue: v.number(),
        weightedValue: v.number(),
      })
    )
  ),
  topDeals: v.optional(
    v.array(
      v.object({
        dealName: v.string(),
        rep: v.string(),
        value: v.number(),
        probability: v.number(),
        status: v.string(),
      })
    )
  ),
  pipelineHealth: v.optional(
    v.object({
      byStage: v.array(
        v.object({
          stage: v.string(),
          value: v.number(),
          valueFormatted: v.optional(v.string()),
          barChart: v.string(),
          observation: v.string(),
        })
      ),
      byRep: v.array(
        v.object({
          rep: v.string(),
          valPct: v.number(),
          valueFormatted: v.optional(v.string()),
          barChart: v.string(),
          observation: v.string(),
        })
      ),
    })
  ),
  riskRadar: v.optional(
    v.object({
      critical: v.array(dealAtRiskValidator),
      atRisk: v.array(dealAtRiskValidator),
      quiet: v.array(dealAtRiskValidator),
    })
  ),
  teamSpotlight: v.optional(
    v.object({ momentum: repSummaryValidator, supportNeeded: repSummaryValidator })
  ),
  patterns: v.optional(v.array(v.object({ pattern: v.string(), observation: v.string() }))),
  priorities: v.optional(v.array(v.string())),
});

export const getLatestReport = moduleQuery({
  module: REPORTS_MODULE_KEY,
  guard: "adminRead",
  args: {},
  returns: v.union(v.null(), boardReportValidator),
  handler: async (ctx) => {
      const { user } = ctx;

      let reports;
      if (user.role !== "SUPER_ADMIN") {
          const companyId = getActiveCompanyId(user);
          if (!companyId) throw appError("UNAUTHORIZED", "Unauthorized: Orphaned administrator account.");
          reports = await ctx.db.query("salesReports")
            .withIndex("by_company", q => q.eq("companyId", companyId))
            .order("desc")
            .take(1);
      } else {
          reports = await ctx.db.query("salesReports")
            .order("desc")
            .take(1);
      }

      const report = reports[0];
      if (!report) return null;

      return {
        headline: report.headline,
        ...(report.executiveSummary === undefined ? {} : { executiveSummary: report.executiveSummary }),
        ...(report.markdownReport === undefined ? {} : { markdownReport: report.markdownReport }),
        kpis: report.kpis,
        ...(report.closingWindows === undefined ? {} : { closingWindows: report.closingWindows }),
        ...(report.topDeals === undefined ? {} : { topDeals: report.topDeals }),
        ...(report.pipelineHealth === undefined ? {} : { pipelineHealth: report.pipelineHealth }),
        ...(report.riskRadar === undefined ? {} : { riskRadar: report.riskRadar }),
        ...(report.teamSpotlight === undefined ? {} : { teamSpotlight: report.teamSpotlight }),
        ...(report.patterns === undefined ? {} : { patterns: report.patterns }),
        ...(report.priorities === undefined ? {} : { priorities: report.priorities }),
      };
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
          .take(1);
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
