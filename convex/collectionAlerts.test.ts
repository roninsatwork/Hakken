import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { renderOutboxRow } from "./outboxTemplates";
import { useMiddayUtc } from "@/src/test/realTime";

/**
 * When collecting stops for something only a person can fix, the super
 * admins hear of it — in the bell and by email, once a UK day for each reason
 * (docs/plans/active/finish-off-plan.md, item 13).
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useMiddayUtc());
afterEach(() => vi.useRealTimers());

describe("collecting needs a person", () => {
  test("each super admin is told once a day for each reason, in the bell and by email, and nobody else", async () => {
    const t = harness();
    const { owner } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { email: "owner@example.com", name: "Owner", role: "SUPER_ADMIN" });
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
      return { owner };
    });
    const reason = "Stopped because today's $100.00 limit for all collecting is reached ($100.42 spent).";

    expect(await t.mutation(internal.collectionAlerts.noteCollectorNeedsYou, { kind: "DAY_CEILING", reason })).toBe(1);
    expect(await t.mutation(internal.collectionAlerts.noteCollectorNeedsYou, { kind: "DAY_CEILING", reason })).toBe(0);
    expect(await t.mutation(internal.collectionAlerts.noteCollectorNeedsYou, { kind: "ACCOUNT", reason: "Stopped because DataForSEO refused the account." })).toBe(1);

    const rows = await t.run(async (ctx) => await ctx.db.query("outboxMessages").collect());
    expect(rows.map((row) => [row.messageType, row.userId])).toEqual([["COLLECTION_NEEDS_YOU", owner], ["COLLECTION_NEEDS_YOU", owner]]);
    const bells = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("notifyUserInternal")).map((job) => job.args[0] as { userId: string; body: string }));
    expect(bells).toHaveLength(2);
    expect(bells.every((bell) => bell.userId === owner)).toBe(true);

    const email = await t.run(async (ctx) => await renderOutboxRow(ctx, rows[0]));
    expect("email" in email && email.email.subject).toMatch(/stopped collecting: it needs you$/);
    expect("email" in email && email.email.text).toContain(reason);
  });
});
