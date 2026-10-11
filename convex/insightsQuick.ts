import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { daysOf } from "./searchConsoleReads";
import { shiftDay } from "./utils/insightFacts";
import { PAGE_READER_AGENT } from "./utils/moneyPageChecks";

/**
 * Insights' daily quick check (docs/plans/active/insights-analyst-plan.md §2,
 * phase 2): fixed rules and no AI, every day, for every website the team
 * covers, so what breaks is seen the same day rather than at the week's
 * findings — a money page that stopped answering, or Google's clicks falling
 * away overnight. Its alerts show on Insights' Executive summary and This week.
 */

const alertValidator = v.object({ code: v.string(), page: v.optional(v.string()), a: v.optional(v.number()), b: v.optional(v.number()), on: v.optional(v.string()) });

/** A day's clicks under this share of the usual is a fall worth saying the same day. */
const FELL_TO = 0.4;
/** Only a website usually clicked at least this often a day is judged. */
const USUAL_FLOOR = 10;
/** The days the usual is read from. */
const USUAL_DAYS = 28;

/** Google's clicks, the newest settled day against the usual of the 28 before it. */
export const clicksToday = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ day: v.string(), clicks: v.number(), usual: v.number() })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (connection?.status !== "CONNECTED" || !connection.newestDay) return null;
    const days = await daysOf(ctx, args.holdId, "web", shiftDay(connection.newestDay, -USUAL_DAYS), connection.newestDay);
    const newest = days.find((day) => day.day === connection.newestDay);
    const before = days.filter((day) => day.day < connection.newestDay!).map((day) => day.clicks).sort((a, b) => a - b);
    if (!newest || before.length < USUAL_DAYS / 2) return null;
    return { day: newest.day, clicks: newest.clicks, usual: before[Math.floor(before.length / 2)] };
  },
});

export const saveQuick = internalMutation({
  args: { holdId: v.id("companyWebsites"), alerts: v.array(alertValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = { companyWebsiteId: args.holdId, day: new Date(now).toISOString().slice(0, 10), alerts: args.alerts, checkedAt: now };
    const held = await ctx.db.query("insightQuickChecks").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (held) await ctx.db.replace(held._id, row);
    else await ctx.db.insert("insightQuickChecks", row);
    return null;
  },
});

/** One website's quick check: each money page asked once, then again if it fails; and Google's clicks. */
export const quickCheck = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const alerts: Array<typeof alertValidator.type> = [];
    const targets = await ctx.runQuery(internal.moneyPageChecks.checkTargets, { holdId: args.holdId });
    const answers = async (address: string) => {
      for (let tries = 0; tries < 2; tries += 1) {
        try {
          const response = await fetch(address, { method: "GET", redirect: "follow", headers: { "User-Agent": PAGE_READER_AGENT }, signal: AbortSignal.timeout(15_000) });
          await response.body?.cancel();
          if (response.status < 400) return response.status;
          if (tries === 1) return response.status;
        } catch {
          if (tries === 1) return 0;
        }
      }
      return 0;
    };
    for (const page of targets?.pages ?? []) {
      const status = await answers(`${targets!.origin}${page.page}`);
      if (status === 0 || status >= 400) alerts.push({ code: "PAGE_DOWN", page: page.page, a: status });
    }
    const clicks = await ctx.runQuery(internal.insightsQuick.clicksToday, { holdId: args.holdId });
    if (clicks && clicks.usual >= USUAL_FLOOR && clicks.clicks < clicks.usual * FELL_TO) {
      alerts.push({ code: "CLICKS_FELL", a: clicks.clicks, b: clicks.usual, on: clicks.day });
    }
    await ctx.runMutation(internal.insightsQuick.saveQuick, { holdId: args.holdId, alerts });
    return null;
  },
});

/** Today's quick check for the website chosen, or the company's first: what it found, and when. */
export const insightsQuickCheck = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({ day: v.string(), alerts: v.array(alertValidator) })),
  handler: async (ctx, args) => {
    let holdId = args.siteId;
    if (holdId) await requireMySite(ctx, holdId);
    else if (ctx.companyId) {
      const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", ctx.companyId!)).take(50);
      holdId = holds.find((hold) => hold.relationship === "OWNED")?._id;
    }
    if (!holdId) return null;
    const row = await ctx.db.query("insightQuickChecks").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId!)).first();
    return row ? { day: row.day, alerts: row.alerts } : null;
  },
});
