import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { readChart, readPeriodBeforeChart } from "./googleAnalyticsChartReads";
import { isTrackedHold } from "./utils/websitePairing";
import { calendarPeriodValidator } from "./utils/calendarPeriods";
import { readMapView } from "./agentReads";
import { conversionColumnsValidator } from "./googleAnalyticsConversionsMap";

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

/**
 * The same website's groups for a chart of groups (ask-hakken-every-chart-plan-2026-10-31.md, phase 1): its channels,
 * kinds of page, devices or countries over the period, through the Conversions map's own read (`readMapView`), so a
 * chart says what the map says. Saved data only.
 */
export const analyticsGroupsInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string(), period: calendarPeriodValidator, by: conversionColumnsValidator },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    if (isTrackedHold(hold)) return { ok: false as const, problem: `Google Analytics covers the company's own websites only, and ${host} is a competitor.` };
    const view = await readMapView({ db: ctx.db, companyId: args.companyId }, { siteId: hold._id, period: args.period, device: "", columns: args.by });
    if (!("visits" in view) || !view.visits) return { ok: false as const, problem: `${host} has no Google Analytics figures for that period yet.` };
    return { ok: true as const, siteId: hold._id, host, view: { visits: view.visits, conversions: view.conversions } };
  },
});
