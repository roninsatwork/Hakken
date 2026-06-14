import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const COMPANY_OVERVIEW_MAX_CHARS = 5000;

function normalizeOverview(value: string) {
  const overview = value.trim();
  if (overview.length === 0) {
    throw new Error("Company overview cannot be empty.");
  }

  if (overview.length > COMPANY_OVERVIEW_MAX_CHARS) {
    throw new Error(`Company overview cannot exceed ${COMPANY_OVERVIEW_MAX_CHARS} characters.`);
  }

  return overview;
}

export const updateCompanyOverview = internalMutation({
  args: {
    companyId: v.id("companies"),
    actorId: v.id("users"),
    overview: v.string(),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const overview = normalizeOverview(args.overview);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found.");

    const previousOverview = company.overview || "";
    const changed = previousOverview !== overview;
    const now = Date.now();

    if (changed) {
      await ctx.db.patch(args.companyId, { overview });
    }

    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actionType: "AGENT_UPDATE_COMPANY_OVERVIEW",
      entityId: args.companyId,
      entityType: "companies",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: args.runId,
        toolCallId: args.toolCallId,
        idempotencyKey: args.idempotencyKey,
        changed,
        previousOverviewLength: previousOverview.length,
        nextOverviewLength: overview.length,
      }),
    });

    return {
      companyId: args.companyId,
      changed,
      previousOverview,
      overview,
    };
  },
});
