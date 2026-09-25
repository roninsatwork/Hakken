import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The platform's company costs screen, read from the day rollups.
 *
 * What must hold (reliability plan 3.4): the window's own days are what is
 * added up, however many older days the table holds. It read from the
 * table's start — the oldest days of the first companies — and once the
 * history passed its ceiling, the window's days were never reached.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("what each company costs", () => {
  test("adds up the window's days, however long the history before them", async () => {
    const t = harness();
    const { adminId, first, second } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now() });
      const first = await ctx.db.insert("companies", { name: "Aardvark", createdAt: Date.now() });
      const second = await ctx.db.insert("companies", { name: "Zebra", createdAt: Date.now() });
      const row = (scopeKey: string, day: string, costUsd: number) => ctx.db.insert("seoDayRollups", {
        scopeKey, day, pulls: 1, reused: 0, sent: 1, ready: 1, failed: 0, costUsd, updatedAt: Date.now(),
      });
      // Fourteen years of one company's days, before the window.
      for (let index = 0; index < 5_100; index += 1) {
        await row(`company:${first}`, new Date(Date.UTC(2010, 0, 1) + index * 86_400_000).toISOString().slice(0, 10), 100);
      }
      const today = new Date().toISOString().slice(0, 10);
      await row(`company:${first}`, today, 1.5);
      await row(`company:${second}`, today, 2.25);
      await row("platform", today, 3.75);
      return { adminId, first, second };
    });

    const costs = await t.withIdentity({ subject: adminId }).query(api.seoCollectionReports.listCompanyCosts, { days: 30 });

    expect(costs.isCapped).toBe(false);
    expect(costs.companies.map((row) => [row.companyId, row.paidUsd])).toEqual([[second, 2.25], [first, 1.5]]);
    expect(costs.paidUsd).toBeCloseTo(3.75, 6);
  });
});
