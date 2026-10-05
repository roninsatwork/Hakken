import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { chargeCreditsNow, findCreditRun, addToCreditRun, refundCreditCharge } from "./creditLedger";

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
    expect(report.settings).toEqual({ creditCoversUsd: 0.05, planCredits: 1000 });
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
  });

  test("a company admin can neither read real costs nor change a price", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seed(t);
    const asAdmin = t.withIdentity({ subject: admin });
    await expect(asAdmin.query(api.creditPricesAdmin.creditPriceReport, {})).rejects.toThrow();
    await expect(asAdmin.mutation(api.creditPricesAdmin.saveCreditPrices, { prices: [{ kind: "rankings", credits: 1 }], creditCoversUsd: 0.05 })).rejects.toThrow();
  });
});
