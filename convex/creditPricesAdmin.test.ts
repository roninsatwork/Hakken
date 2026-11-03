import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMiddayUtc } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { chargeCreditsNow, ensurePlanBatch, findCreditRun, addToCreditRun, refundCreditCharge } from "./creditLedger";
import { DEFAULT_CREDIT_PRICES, creditMonthNamed, creditMonthOf } from "./creditKinds";
import { suggestedCredits } from "./utils/creditMargin";

/**
 * Admin → Settings → Credit prices (docs/plans/active/usage-credits-plan.md,
 * step 2): every company's month of each kind of work, its real cost beside
 * its credits, and the price list saved — audited, and a super admin's alone.
 */

const modules = import.meta.glob("./**/*.*s");
const asCtx = (ctx: unknown) => ctx as MutationCtx;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (raw) => {
    const ctx = asCtx(raw);
    const now = Date.now();
    const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
    const rival = await ctx.db.insert("companies", { name: "Rival", createdAt: now });
    const superAdmin = await ctx.db.insert("users", { email: "owner@example.com", role: "SUPER_ADMIN" });
    const admin = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId: acme });
    // Rankings for two companies, one served by data the other paid for.
    await chargeCreditsNow(ctx, { companyId: acme, kind: "rankings", runKey: "a", how: "scheduled" }, 1000, { realCostUsd: 0.13 }, now);
    await chargeCreditsNow(ctx, { companyId: rival, kind: "rankings", runKey: "b", how: "scheduled" }, 1000, {}, now);
    const rivalRun = await findCreditRun(ctx, "b");
    await addToCreditRun(ctx, rivalRun!, { reusedValueUsd: 0.13 });
    // A lookup is charged when it starts; its calls' cost arrives after.
    await chargeCreditsNow(ctx, { companyId: acme, kind: "keywordResearch", runKey: "research:1", how: "byHand" }, 2, {}, now);
    const lookup = await findCreditRun(ctx, "research:1");
    await addToCreditRun(ctx, lookup!, { realCostUsd: 0.4 });
    // A question that failed and was given back.
    await chargeCreditsNow(ctx, { companyId: acme, kind: "assistant", runKey: "message:1", how: "byHand" }, 1, { realCostUsd: 0.02 }, now);
    const question = await findCreditRun(ctx, "message:1");
    await refundCreditCharge(ctx, question!._id, now);
    return { superAdmin, admin };
  });
}

describe("credit prices", () => {
  test("every company's month, kind by kind: credits, units, what we paid and what sharing saved", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const report = await t.withIdentity({ subject: superAdmin }).query(api.creditPricesAdmin.creditPriceReport, {});
    const line = (kind: string) => report.lines.find((row) => row.kind === kind)!;
    expect(line("rankings")).toMatchObject({ credits: 4, per: 1000, charged: 8, runs: 2, units: 2000, realCostUsd: 0.13, reusedValueUsd: 0.13 });
    // The lookup's cost reached the month though it arrived after the charge.
    expect(line("keywordResearch")).toMatchObject({ charged: 10, realCostUsd: 0.4 });
    // A refund takes its credits off; what it cost us stays.
    expect(line("assistant")).toMatchObject({ charged: 0, realCostUsd: 0.02 });
    expect(line("backlinks")).toMatchObject({ charged: 0, units: 0, realCostUsd: 0 });
    expect(report.settings).toEqual({ creditCoversUsd: 0.05, planCredits: 10_000, marginPercent: 80 });

    // Suggested prices keep an 80% margin on what one unit really cost us.
    // Rankings: $0.13 for 2,000 keywords is $0.000065 each, $0.000325 with the margin kept: 6.5 credits a thousand, so 7.
    expect(line("rankings").costPerUnitUsd).toBeCloseTo(0.000065, 9);
    expect(line("rankings")).toMatchObject({ costMonth: report.month, suggested: 7 });
    // A lookup: $0.40 for 2 keywords is 20 cents each, $1 with the margin kept: 20 credits.
    expect(line("keywordResearch")).toMatchObject({ suggested: 20 });
    // A question: 2 credits now, and 2 cents with the margin kept is 10 cents, 2 credits.
    expect(line("assistant")).toMatchObject({ credits: 2, defaultCredits: 2, suggested: 2 });
    // Nothing to go on, this month or last.
    expect(line("backlinks")).toMatchObject({ costPerUnitUsd: null, costMonth: null, suggested: null });
  });

  test("saving the price list and settings is audited, a change at a time, and counts from the next run", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    const result = await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, {
      prices: [{ kind: "rankings", credits: 3 }, { kind: "siteAudit", credits: 1 }],
      creditCoversUsd: 0.04,
    });
    expect(result).toEqual({ changed: 2 });
    const report = await asOwner.query(api.creditPricesAdmin.creditPriceReport, {});
    expect(report.lines.find((row) => row.kind === "rankings")).toMatchObject({ credits: 3, defaultCredits: 4 });
    expect(report.settings.creditCoversUsd).toBe(0.04);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const logs = await ctx.db.query("auditLogs").collect();
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0].metadata ?? "{}").changes).toEqual([
        { field: "price:rankings", from: 4, to: 3 },
        { field: "creditCoversUsd", from: 0.05, to: 0.04 },
      ]);
      // A charge already made keeps the price it was made at.
      expect((await findCreditRun(ctx, "a"))?.price).toEqual({ credits: 4, per: 1000 });
    });
  });

  test("a price or setting no one could mean is refused", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [{ kind: "rankings", credits: 2.5 }], creditCoversUsd: 0.05 })).rejects.toThrow();
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0 })).rejects.toThrow();
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, planCredits: 1.5 })).rejects.toThrow("whole number");
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, planCredits: -1 })).rejects.toThrow("whole number");
  });

  test("a company admin can neither read real costs nor change a price", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seed(t);
    const asAdmin = t.withIdentity({ subject: admin });
    await expect(asAdmin.query(api.creditPricesAdmin.creditPriceReport, {})).rejects.toThrow();
    await expect(asAdmin.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [{ kind: "rankings", credits: 1 }], creditCoversUsd: 0.05 })).rejects.toThrow();
  });

  test("credits a month are saved on the platform, audited, and given from the next grant", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, planCredits: 25_000 })).toEqual({ changed: 1 });
    expect((await asOwner.query(api.creditPricesAdmin.creditPriceReport, {})).settings.planCredits).toBe(25_000);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const [log] = await ctx.db.query("auditLogs").collect();
      expect(JSON.parse(log.metadata ?? "{}").changes).toEqual([{ field: "planCredits", from: 10_000, to: 25_000 }]);
      // A company with no plan of its own is given the platform's number.
      const fresh = await ctx.db.insert("companies", { name: "Fresh", createdAt: Date.now() });
      await ensurePlanBatch(ctx, fresh, Date.now());
      const batch = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", fresh)).first();
      expect(batch?.granted).toBe(25_000);
    });
  });
});

describe("10,000 credits a month, for now (finish-off-plan.md, item 3a)", () => {
  // The month's batches are found by when the month ends: kept off a midnight.
  beforeEach(() => useMiddayUtc());
  afterEach(() => {
    vi.useRealTimers();
  });

  test("this month's plan batches given 1,000 are raised, each with a line of its own, once", async () => {
    const t = convexTest(schema, modules);
    const { acme, planned } = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const now = Date.now();
      // As dev stood: the platform's setting saved at the first placeholder, and October granted from it.
      await ctx.db.insert("creditSettings", { key: "platform", planCredits: 1_000, creditCoversUsd: 0.05, updatedAt: now });
      const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
      const planned = await ctx.db.insert("companies", { name: "Planned", createdAt: now });
      await chargeCreditsNow(ctx, { companyId: acme, kind: "assistant", runKey: "message:1", how: "byHand" }, 1, {}, now);
      await ensurePlanBatch(ctx, planned, now);
      // Moved since to a plan with its own number.
      const planId = await ctx.db.insert("plans", { name: "Big", messageLimit: -1, priceGBP: 200, monthlyCredits: 50_000, isActive: true, createdAt: now });
      await ctx.db.patch(planned, { planId });
      return { acme, planned };
    });

    const first = await t.mutation(internal.creditCorrections.raisePlanCredits, {});
    expect(first).toMatchObject({ settingRaised: true, raised: 2, done: true });
    expect(first.credits).toBe(9_000 + 49_000);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const lines = await ctx.db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", acme)).collect();
      expect(lines.map((line) => [line.entry, line.reason ?? null, line.creditsIn, line.creditsOut])).toEqual([
        ["grant", null, 1_000, 0],
        // A question is 2 credits (page-screen-redo-plan-2026-11-03.md, step 7).
        ["charge", null, 0, 2],
        ["grant", "raised", 9_000, 0],
      ]);
      expect(lines[2]).toMatchObject({ before: 1_000, balanceAfter: 9_998 });
      const batch = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", acme)).first();
      expect(batch).toMatchObject({ granted: 10_000, left: 9_998 });
      // A plan's own number wins over the platform's.
      const plannedBatch = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", planned)).first();
      expect(plannedBatch?.granted).toBe(50_000);
    });

    // Run again: nothing left to raise.
    expect(await t.mutation(internal.creditCorrections.raisePlanCredits, {})).toMatchObject({ settingRaised: false, raised: 0, credits: 0 });
  });
});

describe("suggested prices keep a margin (page-screen-redo-plan-2026-11-03.md, step 7)", () => {
  // Months are found from the clock: kept off a midnight.
  beforeEach(() => useMiddayUtc());
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the sums: what a unit cost us, over (1 − margin), in credits of what a credit covers, rounded up", () => {
    // Measured on dev, 3 November 2026: 23 questions cost $0.33. At 80% and 5 cents a credit, 2 credits a question.
    expect(suggestedCredits(0.33 / 23, 1, 0.05, 80)).toBe(2);
    // With no margin it is what the work costs: 1.4 cents rounds up to 1 credit.
    expect(suggestedCredits(0.33 / 23, 1, 0.05, 0)).toBe(1);
    // For every `per` units: $0.000065 a keyword is 7 credits a thousand.
    expect(suggestedCredits(0.000065, 1000, 0.05, 80)).toBe(7);
    // Exactly on a whole credit stays on it.
    expect(suggestedCredits(0.01, 1, 0.05, 80)).toBe(1);
    // Never below one credit, and nothing to suggest with no cost.
    expect(suggestedCredits(0.000_000_1, 1, 0.05, 80)).toBe(1);
    expect(suggestedCredits(null, 1, 0.05, 80)).toBeNull();
    // A margin past 95 is read as 95, never a division by nothing.
    expect(suggestedCredits(0.01, 1, 0.05, 100)).toBe(suggestedCredits(0.01, 1, 0.05, 95));
  });

  test("Ask Hakken is 2 credits a question by default; the eye 8 a press, measured at the 80% margin (2026-11-03)", () => {
    expect(DEFAULT_CREDIT_PRICES.assistant).toEqual({ credits: 2, per: 1 });
    expect(DEFAULT_CREDIT_PRICES.sees).toEqual({ credits: 8, per: 1 });
  });

  test("the margin is saved beside what a credit covers, audited, and moves every suggestion", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: 50 })).toEqual({ changed: 1 });
    const report = await asOwner.query(api.creditPricesAdmin.creditPriceReport, {});
    expect(report.settings.marginPercent).toBe(50);
    // Rankings at a 50% margin: $0.00013 a keyword, 2.6 credits a thousand, so 3.
    expect(report.lines.find((row) => row.kind === "rankings")?.suggested).toBe(3);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const [log] = await ctx.db.query("auditLogs").collect();
      expect(log.actionType).toBe("CREDIT_PRICES_CHANGED");
      expect(JSON.parse(log.metadata ?? "{}").changes).toEqual([{ field: "marginPercent", from: 80, to: 50 }]);
    });

    // Left out, it stays as saved, whatever else changes.
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.04 })).toEqual({ changed: 1 });
    expect((await asOwner.query(api.creditPricesAdmin.creditPriceReport, {})).settings).toMatchObject({ creditCoversUsd: 0.04, marginPercent: 50 });
    // The same margin again is no change.
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.04, marginPercent: 50 })).toEqual({ changed: 0 });
  });

  test("a margin is only written once someone sets one", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, planCredits: 20_000 });
    await t.run(async (raw) => {
      const settings = await asCtx(raw).db.query("creditSettings").first();
      expect(settings?.planCredits).toBe(20_000);
      expect(settings?.marginPercent).toBeUndefined();
    });
    expect((await asOwner.query(api.creditPricesAdmin.creditPriceReport, {})).settings.marginPercent).toBe(80);
  });

  test("a margin under 0 or over 95 is refused; 0 and 95 are not", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const asOwner = t.withIdentity({ subject: superAdmin });
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: -1 })).rejects.toThrow("margin");
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: 95.5 })).rejects.toThrow("margin");
    await expect(asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: 100 })).rejects.toThrow("margin");
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: 0 })).toEqual({ changed: 1 });
    expect(await asOwner.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [], creditCoversUsd: 0.05, marginPercent: 95 })).toEqual({ changed: 1 });
    expect((await asOwner.query(api.creditPricesAdmin.creditPriceReport, {})).settings.marginPercent).toBe(95);
  });

  test("with none of the work this month, the suggestion reads last month's cost", async () => {
    const t = convexTest(schema, modules);
    const { superAdmin } = await seed(t);
    const month = creditMonthOf(Date.now()).month;
    const before = creditMonthOf(creditMonthNamed(month).startsAt - 1).month;
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const row = { credits: 0, runs: 1, reusedValueUsd: 0, updatedAt: Date.now() };
      // Last month: links at half a cent each, and rankings far dearer than this month's.
      await ctx.db.insert("creditPlatformMonths", { ...row, month: before, kind: "backlinks", units: 1000, realCostUsd: 0.5 });
      await ctx.db.insert("creditPlatformMonths", { ...row, month: before, kind: "rankings", units: 1000, realCostUsd: 5 });
    });
    const asOwner = t.withIdentity({ subject: superAdmin });
    const line = async (kind: string, args: { month?: string } = {}) => (await asOwner.query(api.creditPricesAdmin.creditPriceReport, args)).lines.find((row) => row.kind === kind)!;

    // $0.0005 a link, $0.0025 with the margin kept: 50 credits a thousand.
    const links = await line("backlinks");
    expect(links.costPerUnitUsd).toBeCloseTo(0.0005, 9);
    expect(links).toMatchObject({ costMonth: before, suggested: 50 });
    // This month has rankings of its own, so last month's are not read.
    expect(await line("rankings")).toMatchObject({ costMonth: month, suggested: 7 });

    // Looking back at last month: its own figures, and nothing from the month before it.
    expect(await line("backlinks", { month: before })).toMatchObject({ costMonth: before, suggested: 50 });
    expect(await line("keywordResearch", { month: before })).toMatchObject({ costPerUnitUsd: null, costMonth: null, suggested: null });
  });
});
