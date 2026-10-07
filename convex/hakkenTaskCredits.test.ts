import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * What Hakken tasks cost (docs/plans/active/hakken-tasks-plan.md, across all
 * of it): each piece of task work counted once through the credit ledger at
 * its own price — placeholders until measured (Anthony, 2026-10-07) — and
 * every task that is on booked in Usage → Coming up.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const owner = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    return { companyId, owner, websiteId, siteId };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function anAlert(t: Harness, seeded: Seeded) {
  return await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId: seeded.owner, kind: "ALERT", title: "Tell me if ronins.test gets fewer than 10 visitors a day", measure: "visitors",
    target: { companyWebsiteId: seeded.siteId, website: "ronins.test" }, condition: { op: "below", value: 10, days: 1 },
    channels: { bell: true, email: false, telegram: false },
  } as never);
}

const chargesOf = (t: Harness, kind: string) => t.run(async (ctx) => (await ctx.db.query("creditCharges").collect()).filter((row) => row.kind === kind && row.entry === "charge"));

describe("what Hakken tasks cost", () => {
  test("an alert's check is counted once for its day, at its price", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId: Id<"hakkenTasks"> = await anAlert(t, seeded);
    const judged = [{ day: "2026-10-04", value: 23, met: false, streak: 0, tells: false }];

    await t.mutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged });
    await t.mutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged });

    const charges = await chargesOf(t, "taskAlerts");
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ state: "charged", creditsOut: 1, how: "scheduled", userId: seeded.owner, websiteId: seeded.websiteId, detail: "Tell me if ronins.test gets fewer than 10 visitors a day" });
  });

  test("a check with no new day to look at counts nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId: Id<"hakkenTasks"> = await anAlert(t, seeded);

    await t.mutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged: [] });

    expect(await chargesOf(t, "taskAlerts")).toEqual([]);
  });

  test("Coming up books every task that is on, by its title, and none that is paused", async () => {
    const t = harness();
    const seeded = await seed(t);
    const on: Id<"hakkenTasks"> = await anAlert(t, seeded);
    const paused: Id<"hakkenTasks"> = await anAlert(t, seeded);
    await t.withIdentity({ subject: seeded.owner }).mutation(api.hakkenTasks.pauseMine, { taskId: paused });

    const data = await t.withIdentity({ subject: seeded.owner }).query(api.creditUsage.usageComingUp, {});

    expect(data?.checks).toHaveLength(1);
    expect(data?.checks[0]).toMatchObject({
      kind: "taskAlerts", taskId: on, title: "Tell me if ronins.test gets fewer than 10 visitors a day", everyDays: 1, each: 1,
      setUpBy: "Anthony Basker", website: { host: "ronins.test", relationship: "owned" },
    });
    expect(data!.checks[0].nextMonth).toBeGreaterThanOrEqual(28);
  });

  test("an offer says its price before the yes", async () => {
    const t = harness();
    expect(await t.query(internal.hakkenTaskCredits.taskPricesInternal, {})).toEqual({ taskAlerts: 1, taskReports: 1, taskResearch: 5 });
  });
});
