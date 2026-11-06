"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ask, openSession } from "./googleAnalyticsSession";
import { quotaFields } from "./googleAnalyticsQuota";

/**
 * One whole span's visits, asked of Google with no split, for an operator to set beside what's saved (overview-new-page-plan,
 * step 1: "Check September's saved total once"). It's one ask and reads the allowance as it does. The saved figures are never
 * changed by it, and nothing runs it by itself.
 */
export const readSpanVisits = internalAction({
  args: { connectionId: v.id("googleAnalyticsConnections"), from: v.string(), to: v.string() },
  returns: v.object({ visits: v.union(v.null(), v.number()), quota: v.union(v.null(), v.object(quotaFields)), problem: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
    if (!target?.owned || target.status !== "CONNECTED" || target.clearing || !target.property) return { visits: null, quota: null, problem: "This website is not ready to ask." };
    const opened = await openSession(ctx, args.connectionId);
    if (!opened.ok) return { visits: null, quota: null, problem: opened.problem };
    const answer = await ask(opened.session, target.property, {
      startDate: args.from, endDate: args.to, dimensions: [], metrics: ["sessions"], hostNames: target.addresses, countries: [target.country],
    });
    if (!answer.ok) return { visits: null, quota: opened.session.quota, problem: `${answer.reason}: ${answer.detail}` };
    return { visits: answer.rows[0]?.values[0] ?? 0, quota: opened.session.quota, problem: null };
  },
});

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
