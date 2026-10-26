"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ask, openSession } from "./googleAnalyticsSession";
import { quotaFields } from "./googleAnalyticsQuota";

/** A one-row report reads Google's current allowance before an operator starts a large fill or validation run. */
export const readAllowance = internalAction({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.object({ requests: v.number(), quota: v.union(v.null(), v.object(quotaFields)), problem: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, args);
    if (!target?.owned || target.status !== "CONNECTED" || target.clearing || !target.property || !target.newestDay) return { requests: 0, quota: null, problem: "This website has no ready Analytics connection." };
    const opened = await openSession(ctx, args.connectionId);
    if (!opened.ok) return { requests: 0, quota: null, problem: opened.problem };
    const answer = await ask(opened.session, target.property, {
      startDate: target.newestDay, endDate: target.newestDay, dimensions: [], metrics: ["sessions"],
    });
    return { requests: opened.session.requests, quota: opened.session.quota, problem: answer.ok ? null : `${answer.reason}: ${answer.detail}` };
  },
});
