import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import {
  hakkenTaskChannelsValidator,
  hakkenTaskConditionValidator,
  hakkenTaskKindValidator,
  hakkenTaskMeasureValidator,
  hakkenTaskStateValidator,
  hakkenTaskTargetValidator,
} from "./hakkenTaskSchema";
import { resolvePlatformName } from "./settingsService";
import { superAdminMutation, superAdminQuery, tenantMutation, tenantQuery, requireTenant } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { nextTaskRun, taskTimeOfDay, taskTimeZone } from "./utils/hakkenTaskTiming";

/**
 * Hakken tasks (docs/plans/active/hakken-tasks-plan.md, item 1.1): what a
 * person has asked Hakken to keep doing for them. A task is its owner's — the
 * person who set it up reads, pauses, resumes and deletes it, and nobody else
 * in the company sees it in the app; a super admin sees a company's on Admin →
 * Companies → Hakken tasks. At most `hakkenTasksPerPerson` of a person's are on
 * at once (a limit on the Limits screens, 25 to start).
 */

/** More than one person could set: the limit's highest choice is 100, and paused and deleted ones are kept. */
const MOST_LISTED = 300;

const taskRowValidator = v.object({
  taskId: v.id("hakkenTasks"),
  kind: hakkenTaskKindValidator,
  state: hakkenTaskStateValidator,
  title: v.string(),
  measure: v.optional(hakkenTaskMeasureValidator),
  target: v.optional(hakkenTaskTargetValidator),
  condition: v.optional(hakkenTaskConditionValidator),
  timeOfDay: v.string(),
  timeZone: v.string(),
  channels: hakkenTaskChannelsValidator,
  lastJudgedDay: v.optional(v.string()),
  nextCheckAt: v.optional(v.number()),
  createdAt: v.number(),
});

type TaskRow = typeof taskRowValidator.type;

function toRow(task: Doc<"hakkenTasks">): TaskRow {
  return {
    taskId: task._id,
    kind: task.kind,
    state: task.state,
    title: task.title,
    ...(task.measure ? { measure: task.measure } : {}),
    ...(task.target ? { target: task.target } : {}),
    ...(task.condition ? { condition: task.condition } : {}),
    timeOfDay: task.timeOfDay,
    timeZone: task.timeZone,
    channels: task.channels,
    ...(task.lastJudgedDay ? { lastJudgedDay: task.lastJudgedDay } : {}),
    ...(task.nextCheckAt !== undefined ? { nextCheckAt: task.nextCheckAt } : {}),
    createdAt: task.createdAt,
  };
}

/** A person's tasks in a company, newest first, deleted ones left out. */
async function tasksOf(ctx: QueryCtx, userId: Id<"users">, companyId: Id<"companies">) {
  const rows = await ctx.db
    .query("hakkenTasks")
    .withIndex("by_owner", (q) => q.eq("userId", userId).eq("companyId", companyId))
    .order("desc")
    .take(MOST_LISTED);
  return rows.filter((task) => task.state !== "DELETED");
}

/** How many of a person's tasks are switched on: the number the limit counts. */
async function onCount(ctx: QueryCtx, userId: Id<"users">, companyId: Id<"companies">): Promise<number> {
  return (await tasksOf(ctx, userId, companyId)).filter((task) => task.state === "ON").length;
}

/** The person's limit, from the company's own number or the platform's. */
export async function tasksAllowed(ctx: QueryCtx, companyId: Id<"companies">): Promise<number> {
  return (await readFanOutLimits(ctx, companyId)).hakkenTasksPerPerson;
}

async function assertRoomFor(ctx: QueryCtx, userId: Id<"users">, companyId: Id<"companies">) {
  const allowed = await tasksAllowed(ctx, companyId);
  if ((await onCount(ctx, userId, companyId)) >= allowed) {
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    throw appError(
      "CONFLICT",
      `You already have ${allowed} ${platformName} tasks switched on, which is the most one person can have. Pause one in ${platformName} tasks, then try again.`,
    );
  }
}

/** The task, if it is the caller's own in their active company; otherwise as though it were not there. */
async function ownTask(ctx: QueryCtx, identity: { userId: Id<"users">; companyId: Id<"companies"> | undefined }, taskId: Id<"hakkenTasks">) {
  const task = await ctx.db.get(taskId);
  if (!task || task.state === "DELETED" || task.userId !== identity.userId || task.companyId !== identity.companyId) {
    throw appError("NOT_FOUND", "That task isn’t there any more.");
  }
  return task;
}

function pausedFields(now: number) {
  return { state: "PAUSED" as const, pausedAt: now, updatedAt: now, nextCheckAt: undefined };
}

async function resume(ctx: MutationCtx, task: Doc<"hakkenTasks">, now: number) {
  if (task.state === "ON") return;
  await assertRoomFor(ctx, task.userId, task.companyId);
  await ctx.db.patch(task._id, { state: "ON", pausedAt: undefined, updatedAt: now, nextCheckAt: nextTaskRun(task.timeOfDay, task.timeZone, now) });
}

// ── The owner's ─────────────────────────────────────────────────────────────

/** Hakken tasks: the caller's own, in their active company. */
export const listMine = tenantQuery({
  args: {},
  returns: v.array(taskRowValidator),
  handler: async (ctx) => {
    const companyId = requireTenant(ctx);
    return (await tasksOf(ctx, ctx.userId, companyId)).map(toRow);
  },
});

export const pauseMine = tenantMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, ctx, args.taskId);
    if (task.state !== "PAUSED") await ctx.db.patch(task._id, pausedFields(Date.now()));
    return null;
  },
});

export const resumeMine = tenantMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resume(ctx, await ownTask(ctx, ctx, args.taskId), Date.now());
    return null;
  },
});

export const deleteMine = tenantMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, ctx, args.taskId);
    const now = Date.now();
    await ctx.db.patch(task._id, { state: "DELETED", deletedAt: now, updatedAt: now, nextCheckAt: undefined });
    return null;
  },
});

// ── A company's, for a super admin ──────────────────────────────────────────

const companyRowValidator = v.object({ ...taskRowValidator.fields, askedBy: v.string() });

/** Admin → Companies → a company → Hakken tasks: everyone's, with who asked. */
export const listForCompany = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.array(companyRowValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("hakkenTasks")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(MOST_LISTED * 4);
    const shown = rows.filter((task) => task.state !== "DELETED");
    const names = new Map<Id<"users">, string>();
    for (const userId of new Set(shown.map((task) => task.userId))) {
      const user = await ctx.db.get(userId);
      names.set(userId, user?.name || user?.email || "Someone who has left");
    }
    return shown.map((task) => ({ ...toRow(task), askedBy: names.get(task.userId) ?? "Someone who has left" }));
  },
});

async function companyTask(ctx: QueryCtx, taskId: Id<"hakkenTasks">) {
  const task = await ctx.db.get(taskId);
  if (!task || task.state === "DELETED") throw appError("NOT_FOUND", "That task isn’t there any more.");
  return task;
}

export const pauseForCompany = superAdminMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await companyTask(ctx, args.taskId);
    if (task.state !== "PAUSED") await ctx.db.patch(task._id, pausedFields(Date.now()));
    return null;
  },
});

export const resumeForCompany = superAdminMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resume(ctx, await companyTask(ctx, args.taskId), Date.now());
    return null;
  },
});

export const deleteForCompany = superAdminMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await companyTask(ctx, args.taskId);
    const now = Date.now();
    await ctx.db.patch(task._id, { state: "DELETED", deletedAt: now, updatedAt: now, nextCheckAt: undefined });
    return null;
  },
});

// ── For the Assistant and the Watcher ───────────────────────────────────────

/**
 * A task, switched on, for its owner: what the Assistant files once its owner
 * says yes (item 1.2). Refused past the person's limit.
 */
export const createInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    kind: hakkenTaskKindValidator,
    title: v.string(),
    measure: v.optional(hakkenTaskMeasureValidator),
    target: v.optional(hakkenTaskTargetValidator),
    condition: v.optional(hakkenTaskConditionValidator),
    usual: v.optional(v.number()),
    timeOfDay: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    channels: hakkenTaskChannelsValidator,
    threadId: v.optional(v.id("threads")),
  },
  returns: v.id("hakkenTasks"),
  handler: async (ctx, args) => {
    await assertRoomFor(ctx, args.userId, args.companyId);
    const now = Date.now();
    const timeOfDay = taskTimeOfDay(args.timeOfDay);
    const timeZone = taskTimeZone(args.timeZone);
    return await ctx.db.insert("hakkenTasks", {
      companyId: args.companyId,
      userId: args.userId,
      kind: args.kind,
      state: "ON",
      title: args.title.trim().slice(0, 300),
      ...(args.measure ? { measure: args.measure } : {}),
      ...(args.target ? { target: args.target } : {}),
      ...(args.condition ? { condition: args.condition } : {}),
      ...(args.usual !== undefined ? { usual: args.usual } : {}),
      timeOfDay,
      timeZone,
      channels: args.channels,
      ...(args.threadId ? { threadId: args.threadId } : {}),
      nextCheckAt: nextTaskRun(timeOfDay, timeZone, now),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** A person's tasks, for the Assistant's own reads (list, pause, resume, delete by asking). */
export const listForOwnerInternal = internalQuery({
  args: { userId: v.id("users"), companyId: v.id("companies") },
  returns: v.array(taskRowValidator),
  handler: async (ctx, args) => (await tasksOf(ctx, args.userId, args.companyId)).map(toRow),
});
