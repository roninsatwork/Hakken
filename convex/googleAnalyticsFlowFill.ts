"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { openSession } from "./googleAnalyticsSession";
import { collectPageLists } from "./googleAnalyticsPageLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { quotaFields } from "./googleAnalyticsQuota";

/**
 * A website's flow filled by itself, for an operator who doesn't want to wait for its night's run
 * (funnel-way-1-plan-2026-11-05.md, step 1). One date at a time from the command line. It asks only what the flow asks, and
 * the session stops itself before a fifth of the hour's or the day's allowance is left, as every run does. Read the allowance
 * first (`googleAnalyticsQuotaActions.readAllowance`).
 */
export const fillFlowLists = internalAction({
  args: { connectionId: v.id("googleAnalyticsConnections"), period: analyticsPeriodValidator, device: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), rows: v.number(), requests: v.number(), quota: v.union(v.null(), v.object(quotaFields)), problem: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
    if (!target?.owned || target.status !== "CONNECTED" || target.clearing || !target.property || !target.newestDay) return { ok: false, rows: 0, requests: 0, quota: null, problem: "This website can't be asked right now." };
    const opened = await openSession(ctx, args.connectionId);
    if (!opened.ok) return { ok: false, rows: 0, requests: 0, quota: null, problem: opened.problem };
    const result = await collectPageLists(ctx, opened.session, args.connectionId, target, { pages: true, period: args.period, device: args.device ?? "", part: "flow" }, target.newestDay);
    return {
      ok: result.ok,
      rows: result.ok ? result.rows : 0,
      requests: opened.session.requests,
      quota: opened.session.quota,
      problem: result.ok ? null : result.reason,
    };
  },
});
