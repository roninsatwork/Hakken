import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

export const createSnapshot = adminMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");
    let companyId = args.companyId;
    if (companyId) {
      assertAdminCanAccessCompany(user, companyId);
    } else if (user.role === "ADMIN") {
      if (!user.companyId) throw new Error("Unauthorized");
      companyId = user.companyId;
    }

    return await ensureAgentVersionSnapshot(ctx, {
      agentId: args.agentId,
      companyId,
    });
  },
});

export const getForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN") {
      if (!user.companyId) throw new Error("Unauthorized");
      return await ctx.db
        .query("agentVersions")
        .withIndex("by_agent_company_created", (q) =>
          q.eq("agentId", args.agentId).eq("companyId", user.companyId)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("agentVersions")
      .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getVersionDetail = adminQuery({
  args: {
    versionId: v.id("agentVersions"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;
    assertAdminCanAccessCompany(user, version.companyId);

    const [runs, fixtures] = await Promise.all([
      ctx.db
        .query("agentRuns")
        .withIndex("by_agent_version_started", (q) => q.eq("agentVersionId", args.versionId))
        .order("desc")
        .take(200),
      ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_agent_version_created", (q) => q.eq("agentVersionId", args.versionId))
        .order("desc")
        .take(200),
    ]);

    const terminalRuns = runs.filter((run) => run.status === "SUCCESS" || run.status === "FAILED" || run.status === "CANCELLED");
    const successfulRuns = runs.filter((run) => run.status === "SUCCESS").length;
    return {
      version,
      stats: {
        runs: runs.length,
        fixtures: fixtures.length,
        successRate: terminalRuns.length > 0 ? successfulRuns / terminalRuns.length : 0,
        costGBP: runs.reduce((total, run) => total + (run.costGBP ?? 0), 0),
      },
      runs,
      fixtures,
    };
  },
});
