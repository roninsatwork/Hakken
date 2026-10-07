import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The Caretaker Agent (docs/plans/active/hakken-tasks-plan.md, Phase 5): once a
 * day, any task that can no longer work paused as Needs you and its owner told
 * in the bell; turned back on once it is fixed, and not before.
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
    const newest = new Date(now - 4 * 86_400_000).toISOString().slice(0, 10);
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      oldestDay: "2026-01-01", newestDay: newest, createdAt: now, updatedAt: now,
    });
    return { companyId, owner, websiteId, siteId, connectionId };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function task(t: Harness, seeded: Seeded, title: string, extra: Record<string, unknown> = {}) {
  return await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId: seeded.owner, kind: "ALERT", title, measure: "visitors",
    target: { companyWebsiteId: seeded.siteId, website: "ronins.test" }, condition: { op: "below", value: 10, days: 1 },
    channels: { bell: true, email: true, telegram: false }, ...extra,
  } as never);
}

async function sweep(t: Harness) {
  vi.useFakeTimers();
  await t.action(internal.hakkenCaretaker.careForTasks, {});
  await finishScheduled(t);
  vi.useRealTimers();
}

const stateOf = (t: Harness, taskId: Id<"hakkenTasks">) => t.run(async (ctx) => {
  const row = await ctx.db.get(taskId);
  return { state: row?.state, reason: row?.needsYou?.reason };
});

describe("the Caretaker's daily sweep", () => {
  test("leaves a task that can work alone, and pauses the same task twice, telling its owner", async () => {
    const t = harness();
    const seeded = await seed(t);
    const first = await task(t, seeded, "Tell me if ronins.test gets fewer than 10 visitors a day");
    const copy = await task(t, seeded, "Tell me if ronins.test gets fewer than 10 visitors a day");

    await sweep(t);

    expect(await stateOf(t, first)).toEqual({ state: "ON", reason: undefined });
    expect(await stateOf(t, copy)).toEqual({ state: "NEEDS_YOU", reason: "DUPLICATE" });
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification).toMatchObject({ kind: "HAKKEN_TASK_NEEDS_YOU", title: "Paused: “Tell me if ronins.test gets fewer than 10 visitors a day”", href: "/app/hakken-tasks" });
  });

  test("pauses an alert whose Search Console was disconnected; turning it on waits until it is reconnected", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await task(t, seeded, "Tell me if it goes quiet");
    await t.run((ctx) => ctx.db.patch(seeded.connectionId, { status: "DISCONNECTED" } as never));

    await sweep(t);
    expect(await stateOf(t, taskId)).toEqual({ state: "NEEDS_YOU", reason: "NOT_CONNECTED" });
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification.body).toBe("ronins.test isn’t connected to Search Console any more. Reconnect it on its Search Console page, then turn it back on in Hakken tasks.");

    const owner = t.withIdentity({ subject: seeded.owner });
    await expect(owner.mutation(api.hakkenTasks.resumeMine, { taskId })).rejects.toThrow(/still can’t work/);
    await t.run((ctx) => ctx.db.patch(seeded.connectionId, { status: "CONNECTED" } as never));
    await owner.mutation(api.hakkenTasks.resumeMine, { taskId });
    expect(await stateOf(t, taskId)).toEqual({ state: "ON", reason: undefined });
  });

  test("pauses an alert on a question no longer tracked, and one whose figures have stopped coming", async () => {
    const t = harness();
    const seeded = await seed(t);
    const question = await task(t, seeded, "Tell me if ChatGPT stops recommending us", {
      measure: undefined, condition: undefined, answer: { prompt: "best agency uk", engine: "chatgpt", watch: "notRecommended" },
    });
    const quiet = await task(t, seeded, "Tell me if the website goes quiet");
    await t.run((ctx) => ctx.db.patch(seeded.connectionId, { newestDay: "2026-01-31" }));

    await sweep(t);

    expect(await stateOf(t, question)).toEqual({ state: "NEEDS_YOU", reason: "QUESTION_GONE" });
    expect(await stateOf(t, quiet)).toEqual({ state: "NEEDS_YOU", reason: "NO_FIGURES" });
  });

  test("switched off, it pauses nothing; and its agent is named from the platform's name", async () => {
    const t = harness();
    const seeded = await seed(t);
    await t.mutation(internal.hakkenCaretaker.ensureCaretakerInternal, {});
    const agent = await t.run((ctx) => ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "HAKKEN_CARETAKER")).first());
    expect(agent?.name).toBe("The Hakken Caretaker Agent");
    await t.run((ctx) => ctx.db.patch(agent!._id, { isActive: false }));
    const copy = (await Promise.all([task(t, seeded, "Same"), task(t, seeded, "Same")]))[1];
    await sweep(t);
    expect((await stateOf(t, copy)).state).toBe("ON");
  });
});
