import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { pictureAttachments } from "./emailPictureEncoder";
import { renderOutboxRow } from "./outboxTemplates";

/**
 * The Hakken Watcher Agent's round, items 1.3 and 1.4 of
 * docs/plans/active/hakken-tasks-plan.md: each alert whose owner's time has
 * come is judged on its newest settled day in plain code, and when its rule
 * is met its owner hears in the bell and by email; it then waits for its next
 * morning.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

afterEach(() => {
  vi.useRealTimers();
});

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const owner = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      oldestDay: "2026-09-20", newestDay: "2026-09-26", createdAt: now, updatedAt: now,
    });
    // A quiet 26 September: 7 visitors, against about 23 the days before.
    for (const [day, clicks] of [["2026-09-24", 23], ["2026-09-25", 24], ["2026-09-26", 7]] as const) {
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day, clicks, impressions: clicks * 20, ctr: 0.05, position: 5, fetchedAt: now });
    }
    return { companyId, owner, siteId };
  });
}

async function alertBelow(t: Harness, seeded: Awaited<ReturnType<typeof seed>>, value: number) {
  const taskId = await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId: seeded.owner, kind: "ALERT", title: `Tell me if ronins.test gets fewer than ${value} visitors a day`,
    measure: "visitors", target: { companyWebsiteId: seeded.siteId, website: "ronins.test" }, condition: { op: "below", value, days: 1 }, usual: 23,
    channels: { bell: true, email: true, telegram: false },
  });
  // Its owner's time has come.
  await t.run((ctx) => ctx.db.patch(taskId, { nextCheckAt: Date.now() - 1 }));
  return taskId;
}

async function round(t: Harness) {
  vi.useFakeTimers();
  await t.action(internal.hakkenWatcherActions.watchDue, {});
  await finishScheduled(t);
  vi.useRealTimers();
}

async function checksOf(t: Harness, taskId: Id<"hakkenTasks">) {
  return await t.run((ctx) => ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", taskId)).collect());
}

describe("the Watcher's morning round", () => {
  test("a rule met on the newest settled day tells its owner in the bell and by email, then waits for the next morning", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await alertBelow(t, seeded, 10);

    await round(t);

    expect((await checksOf(t, taskId)).map((check) => [check.day, check.value, check.met, check.alerted])).toEqual([["2026-09-26", 7, true, true]]);
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.lastJudgedDay).toBe("2026-09-26");
    expect(task?.lastAlertedDay).toBe("2026-09-26");
    expect(task?.nextCheckAt).toBeGreaterThan(Date.now());

    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification).toMatchObject({ userId: seeded.owner, kind: "HAKKEN_TASK_ALERT", href: `/app/search-console/${seeded.siteId}` });
    expect(notification.body).toContain("7");
    const [email] = await t.run((ctx) => ctx.db.query("outboxMessages").collect());
    expect(email).toMatchObject({ messageType: "TASK_ALERT", userId: seeded.owner, email: "anthony@ronins.test", idempotencyKey: `TASK_ALERT:${taskId}:2026-09-26` });

    // The email as its owner gets it, as drawn (board EmailAlertB, items 1.4 and 3.2).
    const rendered = await t.run((ctx) => renderOutboxRow(ctx, email));
    if (!("email" in rendered)) throw new Error(rendered.skip);
    expect(rendered.email.subject).toBe(notification.title);
    expect(rendered.email.html).toContain(">7<");
    expect(rendered.email.html).toContain(">visitors from Google on Saturday 26 September<");
    expect(rendered.email.html).toContain(">ronins.test usually gets about 23 a day. You asked me to tell you if it dropped below 10.<");
    expect(rendered.email.html).toContain('src="cid:task-chart"');
    expect(rendered.email.html).toContain(">Your line: 10<");
    expect(rendered.email.html).toContain(">Sat 26 Sept<");
    // From where Search Console's history starts (20 September), never before it; a day Google showed nothing is none.
    expect(rendered.email.text).toContain("Visitors from Google each day for four weeks, with 5 quiet days marked.");
    const [picture] = rendered.email.pictures;
    expect(picture.bars.values).toEqual([0, 0, 0, 0, 23, 24, 7]);
    expect(picture.bars.marked).toEqual([true, true, true, true, false, false, true]);
    expect(rendered.email.html).toContain(">20 Sept<");
    expect(picture.bars.line).toBe(10);
    expect(pictureAttachments(rendered.email.pictures)[0]).toMatchObject({ content_id: "task-chart", content_type: "image/png" });

    // Its next morning has not come: a second round leaves it alone.
    await round(t);
    expect(await checksOf(t, taskId)).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("outboxMessages").collect())).toHaveLength(1);
  });

  test("a day that does not meet the rule is recorded, and nobody is told", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await alertBelow(t, seeded, 5);

    await round(t);

    expect((await checksOf(t, taskId)).map((check) => [check.day, check.met, check.alerted])).toEqual([["2026-09-26", false, false]]);
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("outboxMessages").collect())).toEqual([]);
  });

  test("a paused alert is not checked, and the Watcher switched off checks nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const paused = await alertBelow(t, seeded, 10);
    await t.run((ctx) => ctx.db.patch(paused, { state: "PAUSED" }));
    await round(t);
    expect(await checksOf(t, paused)).toEqual([]);

    const on = await alertBelow(t, seeded, 10);
    await t.run(async (ctx) => {
      const watcher = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "HAKKEN_WATCHER")).first();
      await ctx.db.patch(watcher!._id, { isActive: false });
    });
    await round(t);
    expect(await checksOf(t, on)).toEqual([]);
  });

  test("its agent is named from the platform's name", async () => {
    const t = harness();
    await t.mutation(internal.hakkenWatcher.ensureWatcherInternal, {});
    const watcher = await t.run((ctx) => ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "HAKKEN_WATCHER")).first());
    expect(watcher?.name).toBe("The Hakken Watcher Agent");
  });
});
