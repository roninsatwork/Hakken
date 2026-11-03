import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { DEFAULT_CREDIT_PRICES, DEFAULT_CREDIT_COVERS_USD, DEFAULT_PLAN_CREDITS, creditMonthNamed, creditMonthOf, type CreditKind } from "./creditKinds";
import { DEFAULT_MARGIN_PERCENT, MAX_MARGIN_PERCENT, suggestedCredits } from "./utils/creditMargin";
import { creditKindValidator } from "./creditSchema";

/**
 * Admin → Settings → Credit prices (docs/plans/active/usage-credits-plan.md,
 * step 2, board AdminCreditPrices): what each kind of work really cost us
 * against what it charged in credits, every company together — the cost
 * audit the prices are set from. Super admin only: real costs never reach a
 * company.
 *
 * Nothing here charges anyone (2026-10-05: "we are just monitoring costs at
 * this stage to set pricing"); the prices saved are what the record charges
 * from the next run.
 *
 * Suggested prices keep a margin (page-screen-redo-plan-2026-11-03.md, step
 * 7): what one unit really cost us, over (1 − margin), in credits of what a
 * credit covers. Suggestions never change a price by themselves.
 */

const KINDS = Object.keys(DEFAULT_CREDIT_PRICES) as CreditKind[];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const lineShape = v.object({
  kind: creditKindValidator,
  /** The price in use: `credits` for every `per` units. */
  credits: v.number(),
  per: v.number(),
  /** The placeholder it started from. */
  defaultCredits: v.number(),
  priceChangedAt: v.union(v.number(), v.null()),
  /** This month, every company: credits charged, runs, the units they were charged for, what we paid, what sharing saved. */
  charged: v.number(),
  runs: v.number(),
  units: v.number(),
  realCostUsd: v.number(),
  reusedValueUsd: v.number(),
  /**
   * What one unit really cost us: the month's real cost over its units, or
   * the month before's when this month has none of that work yet. Null when
   * neither has any.
   */
  costPerUnitUsd: v.union(v.number(), v.null()),
  /** The month that cost was read from, `YYYY-MM`: this month, or the one before. */
  costMonth: v.union(v.string(), v.null()),
  /** The price that keeps the margin, at the saved settings: whole credits for every `per` units. */
  suggested: v.union(v.number(), v.null()),
});

type MonthRow = { units: number; realCostUsd: number };

/** The month before a `YYYY-MM` month, in the UK months credits count in. */
const monthBefore = (month: string) => creditMonthOf(creditMonthNamed(month).startsAt - 1).month;

/** What one unit cost us in a month, or null when the month had none of the work to go on. */
const costPerUnitOf = (row: MonthRow | undefined) => (row && row.units > 0 ? row.realCostUsd / row.units : null);

/** The month's cost audit, kind by kind, and the settings suggestions are made with. */
export const creditPriceReport = superAdminQuery({
  args: { month: v.optional(v.string()) },
  returns: v.object({
    month: v.string(),
    endsAt: v.number(),
    settings: v.object({ creditCoversUsd: v.number(), planCredits: v.number(), marginPercent: v.number() }),
    lines: v.array(lineShape),
  }),
  handler: async (ctx, args) => {
    if (args.month !== undefined && !MONTH_PATTERN.test(args.month)) throw appError("INVALID_INPUT", "A month is written YYYY-MM.");
    const now = Date.now();
    const month = args.month ?? creditMonthOf(now).month;
    const before = monthBefore(month);
    const [rows, rowsBefore, prices, settings] = await Promise.all([
      ctx.db.query("creditPlatformMonths").withIndex("by_month_kind", (q) => q.eq("month", month)).take(KINDS.length),
      ctx.db.query("creditPlatformMonths").withIndex("by_month_kind", (q) => q.eq("month", before)).take(KINDS.length),
      ctx.db.query("creditPrices").take(KINDS.length * 2),
      ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first(),
    ]);
    const creditCoversUsd = settings?.creditCoversUsd ?? DEFAULT_CREDIT_COVERS_USD;
    const marginPercent = settings?.marginPercent ?? DEFAULT_MARGIN_PERCENT;
    return {
      month,
      endsAt: creditMonthNamed(month).endsAt,
      settings: {
        creditCoversUsd,
        planCredits: settings?.planCredits ?? DEFAULT_PLAN_CREDITS,
        marginPercent,
      },
      lines: KINDS.map((kind) => {
        const saved = prices.find((price) => price.kind === kind);
        const row = rows.find((month) => month.kind === kind);
        const per = saved?.per ?? DEFAULT_CREDIT_PRICES[kind].per;
        // This month's cost a unit, or last month's while this month has none of the work yet.
        const thisMonth = costPerUnitOf(row);
        const lastMonth = thisMonth === null ? costPerUnitOf(rowsBefore.find((month) => month.kind === kind)) : null;
        const costPerUnitUsd = thisMonth ?? lastMonth;
        return {
          kind,
          credits: saved?.credits ?? DEFAULT_CREDIT_PRICES[kind].credits,
          per,
          defaultCredits: DEFAULT_CREDIT_PRICES[kind].credits,
          priceChangedAt: saved?.updatedAt ?? null,
          charged: row?.credits ?? 0,
          runs: row?.runs ?? 0,
          units: row?.units ?? 0,
          realCostUsd: row?.realCostUsd ?? 0,
          reusedValueUsd: row?.reusedValueUsd ?? 0,
          costPerUnitUsd,
          costMonth: thisMonth !== null ? month : lastMonth !== null ? before : null,
          suggested: suggestedCredits(costPerUnitUsd, per, creditCoversUsd, marginPercent),
        };
      }),
    };
  },
});

/** Bounds a person could not mean to go past. */
const MAX_CREDITS = 100_000;
const MAX_DOLLARS_A_CREDIT = 10;
const MAX_PLAN_CREDITS = 1_000_000;

async function audit(ctx: MutationCtx & { userId: Id<"users"> }, changes: Array<{ field: string; from: number; to: number }>) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType: "CREDIT_PRICES_CHANGED",
    entityType: "creditPrices",
    timestamp: Date.now(),
    metadata: JSON.stringify({ changes }),
  });
}

/**
 * Save the price list, what a credit covers and the margin (which
 * suggestions are made with), and the credits a month every company's plan
 * gives where its plan sets none (finish-off-plan.md, item 3a). A price applies from each
 * company's next run; a charge already made keeps the price it was made at.
 * Credits a month count from the next month's grant: a month already granted
 * keeps what it was given. Audited, a change at a time.
 */
export const saveCreditPrices = superAdminMutation({
  args: {
    prices: v.array(v.object({ kind: creditKindValidator, credits: v.number() })),
    creditCoversUsd: v.number(),
    /** Credits a month; left out, unchanged. */
    planCredits: v.optional(v.number()),
    /** The margin suggestions keep, in percent; left out, unchanged. */
    marginPercent: v.optional(v.number()),
  },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    for (const price of args.prices) {
      if (!Number.isInteger(price.credits) || price.credits < 0 || price.credits > MAX_CREDITS) throw appError("INVALID_INPUT", `A price is a whole number of credits from 0 to ${MAX_CREDITS.toLocaleString("en-GB")}.`);
    }
    if (!(args.creditCoversUsd > 0 && args.creditCoversUsd <= MAX_DOLLARS_A_CREDIT)) throw appError("INVALID_INPUT", `What a credit covers is more than $0 and at most $${MAX_DOLLARS_A_CREDIT}.`);
    const planCredits = args.planCredits;
    if (planCredits !== undefined && (!Number.isInteger(planCredits) || planCredits < 0 || planCredits > MAX_PLAN_CREDITS)) {
      throw appError("INVALID_INPUT", `Credits a month is a whole number from 0 to ${MAX_PLAN_CREDITS.toLocaleString("en-GB")}.`);
    }
    const marginPercent = args.marginPercent;
    if (marginPercent !== undefined && !(Number.isFinite(marginPercent) && marginPercent >= 0 && marginPercent <= MAX_MARGIN_PERCENT)) {
      throw appError("INVALID_INPUT", `The margin is a number from 0 to ${MAX_MARGIN_PERCENT}.`);
    }

    const now = Date.now();
    const changes: Array<{ field: string; from: number; to: number }> = [];
    for (const price of args.prices) {
      const row = await ctx.db.query("creditPrices").withIndex("by_kind", (q) => q.eq("kind", price.kind)).first();
      const from = row?.credits ?? DEFAULT_CREDIT_PRICES[price.kind].credits;
      if (from === price.credits) continue;
      changes.push({ field: `price:${price.kind}`, from, to: price.credits });
      if (row) await ctx.db.patch(row._id, { credits: price.credits, updatedAt: now, updatedBy: ctx.userId });
      else await ctx.db.insert("creditPrices", { kind: price.kind, credits: price.credits, per: DEFAULT_CREDIT_PRICES[price.kind].per, updatedAt: now, updatedBy: ctx.userId });
    }

    const settings = await ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first();
    const coverBefore = settings?.creditCoversUsd ?? DEFAULT_CREDIT_COVERS_USD;
    const planBefore = settings?.planCredits ?? DEFAULT_PLAN_CREDITS;
    const marginBefore = settings?.marginPercent ?? DEFAULT_MARGIN_PERCENT;
    const marginChanged = marginPercent !== undefined && marginBefore !== marginPercent;
    const settingChanges: Array<{ field: string; from: number; to: number }> = [];
    if (coverBefore !== args.creditCoversUsd) settingChanges.push({ field: "creditCoversUsd", from: coverBefore, to: args.creditCoversUsd });
    if (planCredits !== undefined && planBefore !== planCredits) settingChanges.push({ field: "planCredits", from: planBefore, to: planCredits });
    if (marginChanged) settingChanges.push({ field: "marginPercent", from: marginBefore, to: marginPercent });
    if (settingChanges.length > 0) {
      changes.push(...settingChanges);
      // The margin is written only once someone sets it: a row without one keeps following the default.
      const values = {
        creditCoversUsd: args.creditCoversUsd,
        planCredits: planCredits ?? planBefore,
        ...(marginChanged ? { marginPercent } : {}),
        updatedAt: now,
        updatedBy: ctx.userId,
      };
      if (settings) await ctx.db.patch(settings._id, values);
      else await ctx.db.insert("creditSettings", { key: "platform", ...values });
    }

    if (changes.length > 0) await audit(ctx, changes);
    return { changed: changes.length };
  },
});
