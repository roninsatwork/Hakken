import { v } from "convex/values";

import { internal } from "./_generated/api";
import { adminAction } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";

/**
 * The admin-facing entry points for running company checks.
 *
 * They live here rather than in `companyEvals` because a module that references
 * its own generated `api` types makes the reference circular, and TypeScript
 * resolves that by quietly degrading inference across the whole data model. The
 * queries and mutations stay in `companyEvals`; only the actions that orchestrate
 * them sit here.
 *
 * The provider work itself is in `companyEvalRunActions`, which needs the Node
 * runtime. This file only decides who may run what.
 */

/**
 * Ask the real company AI one check's question and record the graded result.
 *
 * An action rather than a mutation because it makes two provider calls — the
 * assistant answers, then a different model grades — so it cannot be a
 * transaction.
 */
export const runCheck = adminAction({
  args: {
    evalCaseId: v.id("companyEvalCases"),
  },
  handler: async (ctx, args): Promise<{ status: string; score: number }> => {
    const evalCase = await ctx.runQuery(internal.companyEvals.getCaseForRunInternal, {
      evalCaseId: args.evalCaseId,
    });
    if (!evalCase) throw new Error("Eval case not found");
    // A platform check belongs to no company and is the super admin's
    // alone (Anthony's SaaS ruling, 2026-08-17).
    if (evalCase.companyId) {
      assertAdminCanAccessCompany(ctx.user, evalCase.companyId);
    } else if (ctx.user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized access to platform checks");
    }

    const result = await ctx.runAction(internal.companyEvalRunActions.runCompanyCheck, {
      evalCaseId: args.evalCaseId,
      ...(evalCase.companyId ? { companyId: evalCase.companyId } : {}),
      userId: ctx.userId,
    });

    return { status: result.status, score: result.score };
  },
});

/**
 * Run every check that has not yet passed.
 *
 * Scheduled rather than awaited. A batch of real provider calls will outlive a
 * single action's budget, and holding the request open would fail the whole batch
 * on the slowest check. Each check records its own result as it finishes, so the
 * list fills in while the batch is still running — which is also what makes
 * progress visible without a separate progress record to keep in step.
 */
export const runBatch = adminAction({
  args: {
    companyId: v.id("companies"),
    mode: v.union(v.literal("ALL"), v.literal("FAILED_OR_NOT_RUN")),
  },
  handler: async (ctx, args): Promise<{ scheduled: number }> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId);

    const evalCaseIds = await ctx.runQuery(internal.companyEvals.getBatchCaseIdsInternal, {
      companyId: args.companyId,
      mode: args.mode,
    });

    for (const evalCaseId of evalCaseIds) {
      await ctx.scheduler.runAfter(0, internal.companyEvalRunActions.runCompanyCheck, {
        evalCaseId,
        companyId: args.companyId,
        userId: ctx.userId,
      });
    }

    return { scheduled: evalCaseIds.length };
  },
});
