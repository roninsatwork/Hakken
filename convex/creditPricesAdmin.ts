import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { DEFAULT_CREDIT_PRICES, DEFAULT_CREDIT_COVERS_USD, DEFAULT_PLAN_CREDITS, creditMonthOf, type CreditKind } from "./creditKinds";
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
});

/** The month's cost audit, kind by kind, and the settings suggestions are made with. */
export const creditPriceReport = superAdminQuery({
  args: { month: v.optional(v.string()) },
  returns: v.object({
    month: v.string(),
    endsAt: v.number(),
    settings: v.object({ creditCoversUsd: v.number(), planCredits: v.number() }),
    lines: v.array(lineShape),
  }),
  handler: async (ctx, args) => {
    if (args.month !== undefined && !MONTH_PATTERN.test(args.month)) throw appError("INVALID_INPUT", "A month is written YYYY-MM.");
    const now = Date.now();
    const month = args.month ?? creditMonthOf(now).month;
    const [rows, prices, settings] = await Promise.all([
      ctx.db.query("creditPlatformMonths").withIndex("by_month_kind", (q) => q.eq("month", month)).take(KINDS.length),
      ctx.db.query("creditPrices").take(KINDS.length * 2),
      ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first(),
    ]);
    return {
      month,
      endsAt: creditMonthOf(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).endsAt,
      settings: {
        creditCoversUsd: settings?.creditCoversUsd ?? DEFAULT_CREDIT_COVERS_USD,
        planCredits: settings?.planCredits ?? DEFAULT_PLAN_CREDITS,
      },
      lines: KINDS.map((kind) => {
        const saved = prices.find((price) => price.kind === kind);
        const row = rows.find((month) => month.kind === kind);
        return {
          kind,
          credits: saved?.credits ?? DEFAULT_CREDIT_PRICES[kind].credits,
          per: saved?.per ?? DEFAULT_CREDIT_PRICES[kind].per,
          defaultCredits: DEFAULT_CREDIT_PRICES[kind].credits,
          priceChangedAt: saved?.updatedAt ?? null,
          charged: row?.credits ?? 0,
          runs: row?.runs ?? 0,
          units: row?.units ?? 0,
          realCostUsd: row?.realCostUsd ?? 0,
          reusedValueUsd: row?.reusedValueUsd ?? 0,
        };
      }),
    };
  },
});

/** Bounds a person could not mean to go past. */
const MAX_CREDITS = 100_000;
const MAX_DOLLARS_A_CREDIT = 10;

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
 * Save the price list and what a credit covers, which suggestions are made with. A price
 * applies from each company's next run; a charge already made keeps the price
 * it was made at. Audited, a change at a time.
 */
export const saveCreditPrices = superAdminMutation({
  args: {
    prices: v.array(v.object({ kind: creditKindValidator, credits: v.number() })),
    creditCoversUsd: v.number(),
  },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    for (const price of args.prices) {
      if (!Number.isInteger(price.credits) || price.credits < 0 || price.credits > MAX_CREDITS) throw appError("INVALID_INPUT", `A price is a whole number of credits from 0 to ${MAX_CREDITS.toLocaleString("en-GB")}.`);
    }
    if (!(args.creditCoversUsd > 0 && args.creditCoversUsd <= MAX_DOLLARS_A_CREDIT)) throw appError("INVALID_INPUT", `What a credit covers is more than $0 and at most $${MAX_DOLLARS_A_CREDIT}.`);

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
    const before = settings?.creditCoversUsd ?? DEFAULT_CREDIT_COVERS_USD;
    if (before !== args.creditCoversUsd) {
      changes.push({ field: "creditCoversUsd", from: before, to: args.creditCoversUsd });
      const values = { creditCoversUsd: args.creditCoversUsd, updatedAt: now, updatedBy: ctx.userId };
      if (settings) await ctx.db.patch(settings._id, values);
      else await ctx.db.insert("creditSettings", { key: "platform", planCredits: DEFAULT_PLAN_CREDITS, ...values });
    }

    if (changes.length > 0) await audit(ctx, changes);
    return { changed: changes.length };
  },
});
