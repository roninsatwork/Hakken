import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { paginationResultValidator } from "convex/server";
import { rowShape } from "./utils/rowShape";
import { assertAdminCanAccessCompany } from "./authz";
import { reflectRun } from "./agentRunReflectionService";
import { getSelfImprovementConfig } from "./selfImprovementConfig";
import { appError } from "./utils/appError";

const REFLECTION_DETAIL_LIMIT = 200;

export const createForRun = adminMutation({
  args: {
    runId: v.id("agentRuns"),
  },
  returns: v.id("agentRunReflections"),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const result = await reflectRun(ctx, { runId: args.runId, actorId: userId });
    // The service is tolerant for the scheduled path; the button keeps its
    // historical errors so the run screen still explains a refusal.
    if (result.outcome === "missing") throw appError("NOT_FOUND", "Run not found");
    if (result.outcome === "not-eligible") {
      throw appError("CONFLICT", "Only failed or cancelled runs can be reflected");
    }
    return result.reflectionId;
  },
});

/**
 * The same pass, run automatically when a run fails or is cancelled
 * (self-improvement plan, Phase 1). Scheduled from the terminal-status write
 * in agentRuns; nothing here is awaited by the run itself.
 *
 * Always ends by scheduling the memory-candidate pass, whatever the
 * reflection switch says — candidates ran on every terminal run before this
 * existed, and turning reflection off must not also turn them off.
 */
export const createForRunInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    try {
      const config = await getSelfImprovementConfig(ctx.db);
      if (config.autoReflection) {
        await reflectRun(ctx, { runId: args.runId });
      }
    } catch (error) {
      // A run that has already finished must not be failed by its own
      // post-processing, and a broken reflection must not cost the candidate
      // pass below.
      console.error("Automatic reflection failed:", error);
    }
    await ctx.scheduler.runAfter(0, internal.agentMemoryCandidates.generateForRunInternal, {
      runId: args.runId,
    });
  },
});

export const dismissReflection = adminMutation({
  args: {
    reflectionId: v.id("agentRunReflections"),
    reason: v.optional(v.string()),
  },
  returns: v.object({ reflectionId: v.id("agentRunReflections") }),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const reflection = await ctx.db.get(args.reflectionId);
    if (!reflection) throw appError("NOT_FOUND", "Reflection not found");
    assertAdminCanAccessCompany(user, reflection.companyId);
    if (reflection.status !== "GENERATED") {
      throw appError("CONFLICT", "Reflection has already been reviewed");
    }

    const now = Date.now();
    await ctx.db.patch(args.reflectionId, {
      status: "DISMISSED",
      reviewedBy: userId,
      reviewedAt: now,
      dismissalReason: args.reason,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DISMISS_AGENT_RUN_REFLECTION",
      entityId: args.reflectionId,
      entityType: "agentRunReflections",
      companyId: reflection.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: reflection.runId,
        agentId: reflection.agentId,
        category: reflection.category,
        reason: args.reason,
      }),
    });

    return { reflectionId: args.reflectionId };
  },
});

export const getForRun = adminQuery({
  args: {
    runId: v.id("agentRuns"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(rowShape.agentRunReflections),
  handler: async (ctx, args) => {
    const { user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentRunReflections")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRecentForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
  },
  returns: v.array(rowShape.agentRunReflections),
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }

    if (user.role === "SUPER_ADMIN") {
      return await ctx.db
        .query("agentRunReflections")
        .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(REFLECTION_DETAIL_LIMIT);
    }

    return await ctx.db
      .query("agentRunReflections")
      .withIndex("by_company_created", (q) => q.eq("companyId", user.companyId))
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .order("desc")
      .take(REFLECTION_DETAIL_LIMIT);
  },
});
