import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { queueOutboxMessage } from "./outbox";
import schema from "./schema";
import { OUTBOX_STUCK_MS } from "./utils/outboxQueueAgent";

/**
 * The Outbox Queue Processing Agent (docs/plans/active/outbox-and-
 * preferences-plan.md, A2 and A4): made once with its hourly schedule, which
 * then starts it like any scheduled agent, as its Run button does; nothing
 * starts it when an email is queued; and the super admins are told in their
 * bell when emails have waited more than two hours, once a day at most.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const scheduledNames = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));

async function admins(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const superAdmin = await ctx.db.insert("users", { name: "Anthony", email: "anthony@example.co.uk", role: "SUPER_ADMIN", lastLoginAt: Date.now() });
    const reader = await ctx.db.insert("users", { name: "Jo", email: "jo@example.co.uk", role: "USER" });
    return { superAdmin, reader };
  });
}

describe("the Outbox Queue Processing Agent", () => {
  test("is made once, with its hourly schedule, and never overwrites a switch or a schedule someone changed", async () => {
    const t = harness();
    const agentId = await t.mutation(internal.outboxQueueAgent.ensureOutboxAgentInternal, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { isActive: false });
      const schedule = (await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agentId)).first())!;
      await ctx.db.patch(schedule._id, { isActive: false });
    });

    expect(await t.mutation(internal.outboxQueueAgent.ensureOutboxAgentInternal, {})).toBe(agentId);

    const { agent, schedules } = await t.run(async (ctx) => ({
      agent: await ctx.db.get(agentId),
      schedules: await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect(),
    }));
    expect(agent).toMatchObject({ name: "Outbox Queue Processing Agent", systemKey: "OUTBOX_QUEUE_PROCESSOR", isActive: false });
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ isActive: false });
    expect(JSON.parse(schedules[0].intervalStr)).toMatchObject({ cadence: "hourly", everyHours: 1 });
  });

  test("its schedule starts its sending round, as its Run button does; queuing an email starts nothing", async () => {
    const t = harness();
    const { superAdmin, reader } = await admins(t);
    const agentId = await t.mutation(internal.outboxQueueAgent.ensureOutboxAgentInternal, {});
    await t.run((ctx) => queueOutboxMessage(ctx, {
      messageType: "COLLECTION_NEEDS_YOU", userId: reader, email: "jo@example.co.uk", language: "en", payload: { reason: "x" }, idempotencyKey: "c:1",
    }));
    expect((await scheduledNames(t)).some((name) => name.includes("processOutboxNow"))).toBe(false);

    await t.run(async (ctx) => {
      const schedule = (await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agentId)).first())!;
      await ctx.db.patch(schedule._id, { nextRunAt: Date.now() - 1000 });
    });
    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});
    expect((await scheduledNames(t)).filter((name) => name.includes("processOutboxNow"))).toHaveLength(1);

    await t.withIdentity({ subject: superAdmin }).mutation(api.scheduler.manualRunSchedule, { agentId });
    const names = await scheduledNames(t);
    expect(names.filter((name) => name.includes("processOutboxNow"))).toHaveLength(2);
    expect(names.some((name) => name.includes("runTriggeredAgentObjective"))).toBe(false);
  });
});

describe("emails that wait too long", () => {
  test("the super admins are told in their bell, once a day at most, and only about emails waiting more than two hours", async () => {
    const t = harness();
    const { superAdmin, reader } = await admins(t);
    const rowId = await t.run((ctx) => queueOutboxMessage(ctx, {
      messageType: "COLLECTION_NEEDS_YOU", userId: reader, email: "jo@example.co.uk", language: "en", payload: { reason: "x" }, idempotencyKey: "c:1",
    }));

    expect(await t.mutation(internal.outboxQueueAgent.tellIfStuckInternal, {})).toEqual({ waiting: 0, told: 0 });

    await t.run((ctx) => ctx.db.patch(rowId!, { dueAt: Date.now() - OUTBOX_STUCK_MS - 60_000 }));
    expect(await t.mutation(internal.outboxQueueAgent.tellIfStuckInternal, {})).toEqual({ waiting: 1, told: 1 });
    expect(await t.mutation(internal.outboxQueueAgent.tellIfStuckInternal, {})).toEqual({ waiting: 1, told: 0 });

    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      userId: superAdmin, kind: "OUTBOX_STUCK", href: "/admin/content/outbox",
      title: "1 email has waited in the Outbox for more than 2 hours",
    });
  });
});
