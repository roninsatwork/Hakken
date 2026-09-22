import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Starting a collection from a screen.
 *
 * It spends money, so the two things worth holding are that it goes through
 * the same one-cycle-per-company rule the schedule does, and that pressing it
 * leaves a record of who pressed it.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN", createdAt: Date.now(),
    } as never));
  return t.withIdentity({ subject: userId });
}

async function seedCompany(t: Harness): Promise<Id<"companies">> {
  return await t.run(async (ctx) =>
    await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() } as never));
}

describe("starting a collection from a screen", () => {
  test("opens a manual cycle and records who opened it", async () => {
    const t = harness();
    const companyId = await seedCompany(t);
    const asAdmin = await superAdmin(t);

    const result = await asAdmin.mutation(api.seoCollectionStart.startCollectionNow, { companyId });

    expect(result.ok).toBe(true);
    const cycle = await t.run(async (ctx) => await ctx.db.get(result.cycleId!));
    // A manual cycle is marked as one, so the collection screen can tell a run
    // somebody asked for from a run the schedule opened.
    expect(cycle?.trigger).toBe("MANUAL");

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.map((row) => row.actionType)).toContain("START_SEO_COLLECTION");
  });

  test("refuses a second run while one is already under way", async () => {
    const t = harness();
    const companyId = await seedCompany(t);
    const asAdmin = await superAdmin(t);

    const first = await asAdmin.mutation(api.seoCollectionStart.startCollectionNow, { companyId });
    const second = await asAdmin.mutation(api.seoCollectionStart.startCollectionNow, { companyId });

    // A second cycle would plan the same work, and the only thing between that
    // and a doubled bill would be the idempotency key, which is a safety net
    // rather than a plan.
    expect(second.ok).toBe(false);
    expect(second.cycleId).toBe(first.cycleId);

    const cycles = await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect());
    expect(cycles).toHaveLength(1);
  });

  test("an ordinary user cannot spend the platform's money", async () => {
    const t = harness();
    const companyId = await seedCompany(t);
    const userId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        name: "Staff", email: `u-${Math.random()}@test.com`, role: "USER", companyId, createdAt: Date.now(),
      } as never));

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.seoCollectionStart.startCollectionNow, { companyId }),
    ).rejects.toThrow();
  });
});
