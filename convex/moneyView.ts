import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery, superAdminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";

/**
 * The money view (Anthony's pick, 2026-08-17): what the AI handled, and
 * roughly what that is worth in a person's time. Every number is a count
 * of real recorded events, and the minutes-per assumption is visible and
 * changeable on the screen — never hidden maths. Company and platform.
 */

export const DEFAULT_MINUTES_PER_CONVERSATION = 7;
export const DEFAULT_MINUTES_PER_CALL = 12;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export type MoneyView = {
  answered: number;
  calls: number;
  widgetConversations: number;
  unanswered: number;
  minutesPerConversation: number;
  minutesPerCall: number;
  /** (answered × per-conversation + calls × per-call) ÷ 60, rounded. */
  hours: number;
};

function summarise(
  answered: number,
  calls: number,
  widgetConversations: number,
  unanswered: number,
  minutesPerConversation: number,
  minutesPerCall: number
): MoneyView {
  return {
    answered,
    calls,
    widgetConversations,
    unanswered,
    minutesPerConversation,
    minutesPerCall,
    hours: Math.round((answered * minutesPerConversation + calls * minutesPerCall) / 60),
  };
}

async function companyMoneyView(ctx: QueryCtx, companyId: Id<"companies">): Promise<MoneyView> {
  const since = Date.now() - MONTH_MS;
  const sinceDay = new Date(since).toISOString().slice(0, 10);

  const tallies = await ctx.db
    .query("wikiAnswerTallies")
    .withIndex("by_company_day", (q) => q.eq("companyId", companyId).gte("dayKey", sinceDay))
    .take(62);
  const answered = tallies.reduce((sum, row) => sum + row.answered, 0);
  const unanswered = tallies.reduce((sum, row) => sum + row.unanswered, 0);

  const calls = (
    await ctx.db
      .query("phoneCalls")
      .withIndex("by_company_started", (q) => q.eq("companyId", companyId).gte("startedAt", since))
      .take(1000)
  ).filter((call) => call.status === "COMPLETED").length;

  const widgetConversations = (
    await ctx.db
      .query("threads")
      .withIndex("by_company", (q) => q.eq("companyId", companyId).gte("updatedAt", since))
      .take(1000)
  ).filter((thread) => thread.widgetId && thread.createdAt >= since).length;

  const company = await ctx.db.get(companyId);
  return summarise(
    answered,
    calls,
    widgetConversations,
    unanswered,
    company?.moneyMinutesPerConversation ?? DEFAULT_MINUTES_PER_CONVERSATION,
    company?.moneyMinutesPerCall ?? DEFAULT_MINUTES_PER_CALL
  );
}

export const getMoneyViewForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<MoneyView> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await companyMoneyView(ctx, args.companyId);
  },
});

/** The platform's totals: every brain's handled work, added up. Bounded
 * scans with honest caps — this is a monthly management number, not an
 * audit ledger. */
export const getMoneyViewForGlobal = superAdminQuery({
  args: {},
  handler: async (ctx): Promise<MoneyView> => {
    const since = Date.now() - MONTH_MS;
    const sinceDay = new Date(since).toISOString().slice(0, 10);

    const tallies = (await ctx.db.query("wikiAnswerTallies").take(5000)).filter(
      (row) => row.dayKey >= sinceDay
    );
    const answered = tallies.reduce((sum, row) => sum + row.answered, 0);
    const unanswered = tallies.reduce((sum, row) => sum + row.unanswered, 0);

    const calls = (
      await ctx.db
        .query("phoneCalls")
        .withIndex("by_started", (q) => q.gte("startedAt", since))
        .take(2000)
    ).filter((call) => call.status === "COMPLETED").length;

    const widgetConversations = (
      await ctx.db
        .query("threads")
        .withIndex("by_updatedAt", (q) => q.gte("updatedAt", since))
        .take(2000)
    ).filter((thread) => thread.widgetId && thread.createdAt >= since).length;

    const [perConversation, perCall] = await Promise.all([
      ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", "MONEY_MINUTES_PER_CONVERSATION"))
        .unique(),
      ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", "MONEY_MINUTES_PER_CALL"))
        .unique(),
    ]);
    return summarise(
      answered,
      calls,
      widgetConversations,
      unanswered,
      Number(perConversation?.value) || DEFAULT_MINUTES_PER_CONVERSATION,
      Number(perCall?.value) || DEFAULT_MINUTES_PER_CALL
    );
  },
});

const assumptionArgs = {
  minutesPerConversation: v.number(),
  minutesPerCall: v.number(),
};

function normaliseMinutes(value: number): number {
  return Math.min(Math.max(Math.round(value), 1), 120);
}

export const setAssumptionsForCompany = adminMutation({
  args: { companyId: v.id("companies"), ...assumptionArgs },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await ctx.db.patch(args.companyId, {
      moneyMinutesPerConversation: normaliseMinutes(args.minutesPerConversation),
      moneyMinutesPerCall: normaliseMinutes(args.minutesPerCall),
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "MONEY_ASSUMPTIONS_CHANGED",
      entityType: "companies",
      entityId: args.companyId.toString(),
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        minutesPerConversation: normaliseMinutes(args.minutesPerConversation),
        minutesPerCall: normaliseMinutes(args.minutesPerCall),
      }),
    });
  },
});

export const setAssumptionsForGlobal = adminMutation({
  args: assumptionArgs,
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw appError("UNAUTHORIZED", "Unauthorized access to platform settings");
    }
    const now = Date.now();
    for (const [key, value] of [
      ["MONEY_MINUTES_PER_CONVERSATION", normaliseMinutes(args.minutesPerConversation)],
      ["MONEY_MINUTES_PER_CALL", normaliseMinutes(args.minutesPerCall)],
    ] as const) {
      const existing = await ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: String(value), updatedAt: now, updatedBy: ctx.userId });
      } else {
        await ctx.db.insert("systemConfig", {
          key,
          value: String(value),
          updatedAt: now,
          updatedBy: ctx.userId,
        });
      }
    }
  },
});
