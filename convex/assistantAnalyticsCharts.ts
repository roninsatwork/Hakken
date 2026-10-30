import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { readChart, readPeriodBeforeChart } from "./googleAnalyticsChartReads";
import { isTrackedHold } from "./utils/websitePairing";
import { calendarPeriodValidator } from "./utils/calendarPeriods";

/**
 * Ask Hakken's chart from Google Analytics (sees-side-panel-plan-2026-10-31.md, phase 4): the website's days over
 * a calendar period, and the period before laid over them, through the very reads Conversions' chart makes
 * (`readChart`, `readPeriodBeforeChart`). The company is the conversation's; the website one it holds, never a
 * competitor's. Saved data only: nothing is asked of Google.
 */
export const analyticsChartInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string(), period: calendarPeriodValidator },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    if (isTrackedHold(hold)) return { ok: false as const, problem: `Google Analytics covers the company's own websites only, and ${host} is a competitor.` };
    const reader = { db: ctx.db, companyId: args.companyId };
    const common = { siteId: hold._id, period: args.period, device: "" };
    const now = await readChart(reader, common);
    if (now.points.length === 0) return { ok: false as const, problem: `${host} has no Google Analytics days for that period yet.` };
    const before = await readPeriodBeforeChart(reader, common);
    return { ok: true as const, siteId: hold._id, host, events: now.events, points: now.points, before };
  },
});
