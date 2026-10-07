import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { hakkenTaskConditionValidator, hakkenTaskMeasureValidator, hakkenTaskTargetValidator } from "./hakkenTaskSchema";
import { queueOutboxMessage } from "./outbox";
import { ensureReaderPreferences } from "./readerPreferences";
import { startRoleRun } from "./roleRuns";
import { resolvePlatformName } from "./settingsService";
import { nextTaskRun } from "./utils/hakkenTaskTiming";
import { WATCHER } from "./utils/hakkenWatcher";

/**
 * The Watcher's database side (docs/plans/active/hakken-tasks-plan.md,
 * items 1.3 and 1.4): its agent kept in step, the alerts due, and what one
 * check records — every day it judged, and, when the rule is met, the alert
 * to its owner in the bell and by email. The round itself, and the alert's
 * words, are `hakkenWatcherActions.ts`.
 */

/** Idempotent: the Watcher's agent, created once and kept in step — its name from the platform's — never overwriting its switch. */
export const ensureWatcherInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    const definition = {
      name: WATCHER.nameFor(platformName),
      description: WATCHER.description,
      systemPrompt: WATCHER.systemPrompt,
      standingObjective: WATCHER.standingObjective,
    };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", WATCHER.systemKey)).first();
    if (!existing) {
      await ctx.db.insert("agents", {
        ...definition,
        systemKey: WATCHER.systemKey,
        modelId: "fast-chat (resolved at run time)",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return null;
  },
});

/** Alerts that are on and due, oldest due first. */
export const dueTasksInternal = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(v.id("hakkenTasks")),
  handler: async (ctx, args) => {
    const due = await ctx.db
      .query("hakkenTasks")
      .withIndex("by_state_next", (q) => q.eq("state", "ON").lte("nextCheckAt", args.now))
      .take(args.limit);
    return due.filter((task) => task.kind === "ALERT").map((task) => task._id);
  },
});

/** One alert, with what checking it needs: the days in a row before it, and the newest day Search Console holds for its website. */
export const taskForCheckInternal = internalQuery({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.union(
    v.null(),
    v.object({
      taskId: v.id("hakkenTasks"),
      companyId: v.id("companies"),
      userId: v.id("users"),
      title: v.string(),
      measure: hakkenTaskMeasureValidator,
      target: hakkenTaskTargetValidator,
      condition: hakkenTaskConditionValidator,
      usual: v.optional(v.number()),
      createdAt: v.number(),
      lastJudgedDay: v.optional(v.string()),
      streakBefore: v.number(),
      newestDay: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.state !== "ON" || task.kind !== "ALERT" || !task.measure || !task.target || !task.condition) return null;
    const last = await ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", task._id)).order("desc").first();
    const target = task.target;
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", target.companyWebsiteId))
      .first();
    return {
      taskId: task._id,
      companyId: task.companyId,
      userId: task.userId,
      title: task.title,
      measure: task.measure,
      target,
      condition: task.condition,
      ...(task.usual !== undefined ? { usual: task.usual } : {}),
      createdAt: task.createdAt,
      ...(task.lastJudgedDay ? { lastJudgedDay: task.lastJudgedDay } : {}),
      streakBefore: last?.streak ?? 0,
      ...(connection?.newestDay ? { newestDay: connection.newestDay } : {}),
    };
  },
});

const judgedDayValidator = v.object({ day: v.string(), value: v.number(), met: v.boolean(), streak: v.number(), tells: v.boolean() });

/**
 * What one check found: every day judged, recorded once; the alert, when the
 * newest day tells, to its owner — the bell, and an email through the outbox
 * that the Email Sender sends — once a day for each task; and when it next
 * runs. A task paused or deleted while it was being checked records nothing.
 */
export const recordCheckInternal = internalMutation({
  args: {
    taskId: v.id("hakkenTasks"),
    judged: v.array(judgedDayValidator),
    problem: v.optional(v.string()),
    alert: v.optional(v.object({ day: v.string(), headline: v.string(), body: v.string(), value: v.number(), usual: v.optional(v.number()) })),
  },
  returns: v.object({ recorded: v.number(), alerted: v.boolean() }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.state !== "ON") return { recorded: 0, alerted: false };
    const now = Date.now();
    let recorded = 0;
    for (const day of args.judged) {
      const seen = await ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", task._id).eq("day", day.day)).first();
      if (seen) continue;
      await ctx.db.insert("hakkenTaskChecks", {
        taskId: task._id, companyId: task.companyId, day: day.day, value: day.value, met: day.met, streak: day.streak,
        alerted: Boolean(args.alert && args.alert.day === day.day), checkedAt: now,
      });
      recorded += 1;
    }
    const newest = args.judged.reduce<string | undefined>((latest, day) => (!latest || day.day > latest ? day.day : latest), task.lastJudgedDay);
    await ctx.db.patch(task._id, {
      ...(newest ? { lastJudgedDay: newest } : {}),
      ...(args.alert ? { lastAlertedDay: args.alert.day } : {}),
      nextCheckAt: nextTaskRun(task.timeOfDay, task.timeZone, now),
      updatedAt: now,
    });

    if (!args.alert) return { recorded, alerted: false };
    const owner = await ctx.db.get(task.userId);
    if (!owner) return { recorded, alerted: false };
    const link = task.target ? `/app/search-console/${task.target.companyWebsiteId}${task.target.page ? "/pages" : ""}` : "/app/hakken-tasks";
    let emailed = false;
    if (task.channels.email && owner.email) {
      const preferences = await ensureReaderPreferences(ctx, owner._id);
      emailed = Boolean(await queueOutboxMessage(ctx, {
        messageType: "TASK_ALERT",
        userId: owner._id,
        email: owner.email,
        language: preferences?.language ?? "en",
        payload: {
          taskId: task._id, headline: args.alert.headline, body: args.alert.body, value: args.alert.value,
          ...(args.alert.usual !== undefined ? { usual: args.alert.usual } : {}), measure: task.measure ?? "visitors", link,
        },
        idempotencyKey: `TASK_ALERT:${task._id}:${args.alert.day}`,
      }));
    }
    if (task.channels.bell) {
      await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
        userId: owner._id, companyId: task.companyId, kind: "HAKKEN_TASK_ALERT", title: args.alert.headline, body: args.alert.body, href: link,
      });
    }
    if (emailed) await startRoleRun(ctx, "EMAIL_SENDER", { objective: "Send: an alert someone asked for.", title: "A task's alert" });
    return { recorded, alerted: true };
  },
});

/** Whether the Watcher is switched on; it is, until someone switches it off on the Agents screen. */
export const isWatcherOnInternal = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", WATCHER.systemKey)).first();
    return agent?.isActive ?? true;
  },
});

export type WatcherTaskId = Id<"hakkenTasks">;
