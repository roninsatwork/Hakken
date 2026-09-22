import { v } from "convex/values";

import { superAdminMutation } from "./tenantFunctions";
import { openSeoCycle } from "./seoTools";

/**
 * Start a collection now, from a screen.
 *
 * Until this existed the only way to open a cycle was the agent's own tool on
 * a scheduled run, so testing a change meant waiting for a schedule and
 * support had nothing to offer a client asking for fresh numbers today.
 *
 * It opens the same cycle the schedule opens, through the same function, so
 * there is one path and one set of rules rather than two that drift. In
 * particular the one-open-cycle-per-company rule is enforced there: pressing
 * this twice does not plan the work twice.
 *
 * **Super admin only, because it spends money.** Every pull the cycle plans is
 * a charge on Hakken's DataForSEO account, which is also why the button lives
 * on the platform's own collection screen rather than in a company workspace
 * that customers will one day see. It is audited for the same reason.
 */
export const startCollectionNow = superAdminMutation({
  args: { companyId: v.id("companies") },
  returns: v.object({
    ok: v.boolean(),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await openSeoCycle(ctx, { companyId: args.companyId, trigger: "MANUAL" });

    // Recorded whether or not a cycle opened: "somebody pressed it and it was
    // already running" is the fact an audit reader wants when two runs appear
    // close together.
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "START_SEO_COLLECTION",
      ...(result.cycleId ? { entityId: result.cycleId } : {}),
      entityType: "seoCollectionCycles",
      companyId: args.companyId,
      metadata: JSON.stringify({ opened: result.ok }),
      timestamp: Date.now(),
    });

    return result;
  },
});
