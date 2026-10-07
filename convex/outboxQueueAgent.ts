import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { OUTBOX_QUEUE_AGENT, OUTBOX_SCHEDULE, OUTBOX_STUCK_MS, OUTBOX_STUCK_REMIND_MS } from "./utils/outboxQueueAgent";

/**
 * The Outbox Queue Processing Agent (docs/plans/active/outbox-and-
 * preferences-plan.md, A2): created once with its hourly schedule — which
 * then lives on the Schedules screen, where an administrator may change it —
 * and run by that schedule like any scheduled agent (`agentRunStartService`
 * sends it to `outboxQueueRun.processOutboxNow`). Nothing starts it when an
 * email is queued: emails wait for its next run (Anthony, 2026-10-07).
 *
 * An hourly watch keeps it there and tells the super admins in their bell when
 * emails have waited more than two hours — switched off, its schedule
 * stopped, or broken — at most once a day while it lasts. The bell does not
 * go through the Outbox, so it gets through.
 */

/** Idempotent: the agent, made once and kept in step, and its hourly schedule made with it. Never overwrites its switch or a changed schedule. */
export const ensureOutboxAgentInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => {
    const now = Date.now();
    const definition = {
      name: OUTBOX_QUEUE_AGENT.name,
      description: OUTBOX_QUEUE_AGENT.description,
      systemPrompt: OUTBOX_QUEUE_AGENT.systemPrompt,
      standingObjective: OUTBOX_QUEUE_AGENT.standingObjective,
    };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", OUTBOX_QUEUE_AGENT.systemKey)).first();
    if (existing) {
      if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
        await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
      }
      return existing._id;
    }
    const agentId = await ctx.db.insert("agents", {
      ...definition,
      systemKey: OUTBOX_QUEUE_AGENT.systemKey,
      modelId: "none (plain code)",
      thinkingMode: false,
      isActive: true,
      isGlobal: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("schedules", {
      name: OUTBOX_SCHEDULE.name,
      agentId,
      intervalStr: OUTBOX_SCHEDULE.intervalStr,
      isActive: true,
      nextRunAt: getNextWorkflowScheduleRunAt({ intervalStr: OUTBOX_SCHEDULE.intervalStr, now: new Date(now) }),
      createdAt: now,
    });
    return agentId;
  },
});

/** The super admins told when emails have waited too long — once a day at most, while it lasts. */
export const tellIfStuckInternal = internalMutation({
  args: {},
  returns: v.object({ waiting: v.number(), told: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const oldest = await ctx.db
      .query("outboxMessages")
      .withIndex("by_status_due", (q) => q.eq("status", "WAITING").lte("dueAt", now - OUTBOX_STUCK_MS))
      .order("asc")
      .take(101);
    if (oldest.length === 0) return { waiting: 0, told: 0 };
    const since = new Date(oldest[0].dueAt).toISOString().slice(0, 16).replace("T", " ");
    const count = oldest.length > 100 ? "More than 100" : String(oldest.length);
    let told = 0;
    for (const admin of await ctx.db.query("users").withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN")).take(50)) {
      const recent = await ctx.db
        .query("notifications")
        .withIndex("by_user_created", (q) => q.eq("userId", admin._id).gte("createdAt", now - OUTBOX_STUCK_REMIND_MS))
        .take(200);
      if (recent.some((note) => note.kind === "OUTBOX_STUCK")) continue;
      await ctx.db.insert("notifications", {
        userId: admin._id,
        kind: "OUTBOX_STUCK",
        title: `${count} ${oldest.length === 1 ? "email has" : "emails have"} waited in the Outbox for more than 2 hours`,
        body: `The oldest has waited since ${since} UTC. Check that the ${OUTBOX_QUEUE_AGENT.name} is switched on and its schedule is running.`,
        href: "/admin/content/outbox",
        createdAt: now,
      });
      told += 1;
    }
    return { waiting: oldest.length, told };
  },
});

/** Every hour (`jobLedger.ts`): the agent and its schedule kept there, and stuck emails told. */
export const watchOutbox = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await ctx.runMutation(internal.outboxQueueAgent.ensureOutboxAgentInternal, {});
    await ctx.runMutation(internal.outboxQueueAgent.tellIfStuckInternal, {});
    return null;
  },
});
