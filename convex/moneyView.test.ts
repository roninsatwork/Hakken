import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The money view's counts are floors when a scan is capped, and say so.
 *
 * Every figure on this screen was read-then-filtered under a cap, and a cap
 * that is reached is indistinguishable from one that is not: a busy month came
 * back looking like a quiet one, with nothing anywhere reporting the gap. The
 * reads now ask for one row past the cap, because that row is the only
 * evidence there was more.
 *
 * The day-tally cap is 62 and is the cheapest of the four to exceed honestly,
 * so it is the one these prove against. The mechanism is shared.
 */

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
    const superAdmin = await ctx.db.insert("users", {
      email: "anthony@ronins.co.uk",
      name: "Anthony",
      role: "SUPER_ADMIN",
    });
    return { companyId, superAdmin };
  });
}

/**
 * Rows are seeded inside the thirty-day window, cycling over its days.
 *
 * Walking one day further back per row put most of them outside the index
 * range the query asks for, so sixty-three rows arrived as thirty-one and the
 * cap was never reached — the seeding, not the code, was wrong.
 */
const seedTallies = async (t: ReturnType<typeof convexTest>, companyId: string, days: number) => {
  await t.run(async (ctx) => {
    for (let index = 0; index < days; index += 1) {
      const day = new Date(Date.now() - (index % 29) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await ctx.db.insert("wikiAnswerTallies", {
        companyId: companyId as never,
        dayKey: day,
        answered: 1,
        unanswered: 0,
      });
    }
  });
};

describe("the money view reports what it could not see", () => {
  test("a month inside every cap reports a total, not a floor", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdmin } = await seedCompany(t);
    await seedTallies(t, companyId, 10);

    const view = await t
      .withIdentity({ subject: superAdmin })
      .query(api.moneyView.getMoneyViewForCompany, { companyId });

    expect(view.partial).toBe(false);
    expect(view.answered).toBe(10);
  });

  test("a month that overran a cap says so, and still reports the figures", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdmin } = await seedCompany(t);
    // TALLY_DAYS is 62; a sixty-third row is what makes the overrun visible.
    await seedTallies(t, companyId, 63);

    const view = await t
      .withIdentity({ subject: superAdmin })
      .query(api.moneyView.getMoneyViewForCompany, { companyId });

    expect(view.partial).toBe(true);
    // Still answers. A floor is worth more than a blank screen.
    expect(view.answered).toBeGreaterThan(0);
  });

  test("the platform view reports the same way", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdmin } = await seedCompany(t);
    await seedTallies(t, companyId, 5);

    const view = await t
      .withIdentity({ subject: superAdmin })
      .query(api.moneyView.getMoneyViewForGlobal, {});

    expect(view.partial).toBe(false);
    expect(view.answered).toBe(5);
  });
});
