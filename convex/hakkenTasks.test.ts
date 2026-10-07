import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tasksAllowed } from "./hakkenTasks";
import schema from "./schema";

/**
 * Hakken tasks, item 1.1 of docs/plans/active/hakken-tasks-plan.md: a task is
 * its owner's, at most so many are on at once per person, and only a super
 * admin sees a company's.
 */

const modules = import.meta.glob("./**/*.*s");

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Conterra Ops", createdAt: now });
    const me = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const colleague = await ctx.db.insert("users", { name: "Jo Hughes", email: "jo@ronins.test", role: "ADMIN", companyId, createdAt: now });
    const superAdmin = await ctx.db.insert("users", { name: "Platform", email: "platform@hakken.test", role: "SUPER_ADMIN", companyId: otherCompanyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: now });
    const companyWebsiteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    return { companyId, otherCompanyId, me, colleague, superAdmin, companyWebsiteId };
  });
}

function anAlert(seeded: Awaited<ReturnType<typeof seed>>, userId: Id<"users">, title = "Tell me if /web-design-london/ gets fewer than 10 visitors a day") {
  return {
    companyId: seeded.companyId,
    userId,
    kind: "ALERT" as const,
    title,
    measure: "visitors" as const,
    target: { companyWebsiteId: seeded.companyWebsiteId, website: "ronins.co.uk", page: "/web-design-london/" },
    condition: { op: "below" as const, value: 10, days: 1 },
    timeOfDay: "09:00",
    timeZone: "Europe/London",
    channels: { bell: true, email: true, telegram: false },
  };
}

describe("a Hakken task is its owner's", () => {
  test("its owner sees it and can pause, resume and delete it; a colleague neither sees nor touches it", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const taskId = await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me));

    const mine = await t.withIdentity({ subject: seeded.me }).query(api.hakkenTasks.listMine, {});
    expect(mine.map((task) => task.title)).toEqual(["Tell me if /web-design-london/ gets fewer than 10 visitors a day"]);
    expect(mine[0].state).toBe("ON");
    expect(mine[0].nextCheckAt).toBeGreaterThan(Date.now());

    const asColleague = t.withIdentity({ subject: seeded.colleague });
    expect(await asColleague.query(api.hakkenTasks.listMine, {})).toEqual([]);
    await expect(asColleague.mutation(api.hakkenTasks.pauseMine, { taskId })).rejects.toThrow(/isn’t there any more/);
    await expect(asColleague.mutation(api.hakkenTasks.deleteMine, { taskId })).rejects.toThrow(/isn’t there any more/);

    const asMe = t.withIdentity({ subject: seeded.me });
    await asMe.mutation(api.hakkenTasks.pauseMine, { taskId });
    expect((await asMe.query(api.hakkenTasks.listMine, {}))[0]).toMatchObject({ state: "PAUSED" });
    expect((await asMe.query(api.hakkenTasks.listMine, {}))[0].nextCheckAt).toBeUndefined();

    await asMe.mutation(api.hakkenTasks.resumeMine, { taskId });
    expect((await asMe.query(api.hakkenTasks.listMine, {}))[0]).toMatchObject({ state: "ON" });

    await asMe.mutation(api.hakkenTasks.deleteMine, { taskId });
    expect(await asMe.query(api.hakkenTasks.listMine, {})).toEqual([]);
  });

  test("a super admin sees a company's tasks with who asked; nobody else can", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me));
    await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.colleague, "Every Monday, send me the five pages that lost the most visitors"));

    const all = await t.withIdentity({ subject: seeded.superAdmin }).query(api.hakkenTasks.listForCompany, { companyId: seeded.companyId });
    expect(all.map((task) => task.askedBy).sort()).toEqual(["Anthony Basker", "Jo Hughes"]);

    // A company admin is not a super admin: the company-wide view is Admin's.
    await expect(t.withIdentity({ subject: seeded.colleague }).query(api.hakkenTasks.listForCompany, { companyId: seeded.companyId })).rejects.toThrow();
  });
});

describe("how many a person can have on", () => {
  test("starts at 25, the platform's number", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    expect(await t.run((ctx) => tasksAllowed(ctx, seeded.companyId))).toBe(25);
  });

  test("a company's own number holds; paused tasks do not count; resuming past it is refused", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    await t.run((ctx) => ctx.db.insert("fanOutLimits", { companyId: seeded.companyId, hakkenTasksPerPerson: 2, updatedAt: Date.now() }));

    const first = await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me, "First"));
    await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me, "Second"));
    await expect(t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me, "Third"))).rejects.toThrow(/already have 2 Hakken tasks switched on/);

    // Someone else's tasks are theirs to count.
    await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.colleague, "Jo's first"));

    const asMe = t.withIdentity({ subject: seeded.me });
    await asMe.mutation(api.hakkenTasks.pauseMine, { taskId: first });
    await t.mutation(internal.hakkenTasks.createInternal, anAlert(seeded, seeded.me, "Third"));
    await expect(asMe.mutation(api.hakkenTasks.resumeMine, { taskId: first })).rejects.toThrow(/Pause one in Hakken tasks/);
  });
});
