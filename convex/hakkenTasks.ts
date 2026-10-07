import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import {
  hakkenTaskChannelsValidator,
  hakkenTaskConditionValidator,
  hakkenTaskKindValidator,
  hakkenTaskMeasureValidator,
  hakkenTaskReportValidator,
  hakkenTaskStateValidator,
  hakkenTaskTargetValidator,
} from "./hakkenTaskSchema";
import { resolvePlatformName } from "./settingsService";
import { superAdminMutation, superAdminQuery, tenantMutation, tenantQuery, requireTenant } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { nextRunOf, taskTimeOfDay, taskTimeZone } from "./utils/hakkenTaskTiming";

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
  report: v.optional(hakkenTaskReportValidator),
  timeOfDay: v.string(),
  timeZone: v.string(),
  channels: hakkenTaskChannelsValidator,
  lastJudgedDay: v.optional(v.string()),
  lastAlertedDay: v.optional(v.string()),
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
    ...(task.report ? { report: task.report } : {}),
    timeOfDay: task.timeOfDay,
    timeZone: task.timeZone,
    channels: task.channels,
    ...(task.lastJudgedDay ? { lastJudgedDay: task.lastJudgedDay } : {}),
    ...(task.lastAlertedDay ? { lastAlertedDay: task.lastAlertedDay } : {}),
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
  await ctx.db.patch(task._id, { state: "ON", pausedAt: undefined, updatedAt: now, nextCheckAt: nextRunOf(task, now) });
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

/** `askedBy` is null for someone no longer a user: the screen words that. */
const companyRowValidator = v.object({ ...taskRowValidator.fields, askedBy: v.union(v.string(), v.null()) });

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
    const names = new Map<Id<"users">, string | null>();
    for (const userId of new Set(shown.map((task) => task.userId))) {
      const user = await ctx.db.get(userId);
      names.set(userId, user?.name || user?.email || null);
    }
    return shown.map((task) => ({ ...toRow(task), askedBy: names.get(task.userId) ?? null }));
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
const newTaskArgs = {
  companyId: v.id("companies"),
  userId: v.id("users"),
  kind: hakkenTaskKindValidator,
  title: v.string(),
  measure: v.optional(hakkenTaskMeasureValidator),
  target: v.optional(hakkenTaskTargetValidator),
  condition: v.optional(hakkenTaskConditionValidator),
  report: v.optional(hakkenTaskReportValidator),
  usual: v.optional(v.number()),
  timeOfDay: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  channels: hakkenTaskChannelsValidator,
  threadId: v.optional(v.id("threads")),
};

export const createInternal = internalMutation({
  args: newTaskArgs,
  returns: v.id("hakkenTasks"),
  handler: async (ctx, args) => await insertTask(ctx, args),
});

type NewTask = {
  companyId: Id<"companies">;
  userId: Id<"users">;
  kind: Doc<"hakkenTasks">["kind"];
  title: string;
  measure?: Doc<"hakkenTasks">["measure"];
  target?: Doc<"hakkenTasks">["target"];
  condition?: Doc<"hakkenTasks">["condition"];
  report?: Doc<"hakkenTasks">["report"];
  usual?: number;
  timeOfDay?: string;
  timeZone?: string;
  channels: Doc<"hakkenTasks">["channels"];
  threadId?: Id<"threads">;
};

/** A task, switched on, for its owner; refused past their limit. */
async function insertTask(ctx: MutationCtx, args: NewTask): Promise<Id<"hakkenTasks">> {
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
    ...(args.report ? { report: args.report } : {}),
    ...(args.usual !== undefined ? { usual: args.usual } : {}),
    timeOfDay,
    timeZone,
    channels: args.channels,
    ...(args.threadId ? { threadId: args.threadId } : {}),
    nextCheckAt: nextRunOf({ timeOfDay, timeZone, ...(args.report ? { report: args.report } : {}) }, now),
    createdAt: now,
    updatedAt: now,
  });
}

/** A person's tasks, for the Assistant's own reads (list, pause, resume, delete by asking). */
export const listForOwnerInternal = internalQuery({
  args: { userId: v.id("users"), companyId: v.id("companies") },
  returns: v.array(taskRowValidator),
  handler: async (ctx, args) => (await tasksOf(ctx, args.userId, args.companyId)).map(toRow),
});

/** One of a person's own tasks, by an id the model passed: null when it is not theirs, or not an id at all. */
export const ownTaskInternal = internalQuery({
  args: { userId: v.id("users"), companyId: v.id("companies"), taskId: v.string() },
  returns: v.union(v.null(), taskRowValidator),
  handler: async (ctx, args) => {
    const taskId = ctx.db.normalizeId("hakkenTasks", args.taskId);
    const task = taskId ? await ctx.db.get(taskId) : null;
    if (!task || task.state === "DELETED" || task.userId !== args.userId || task.companyId !== args.companyId) return null;
    return toRow(task);
  },
});

// ── The person's yes or no ──────────────────────────────────────────────────

/**
 * The answer to a change the Assistant proposed in a reply (item 1.2): yes
 * sets up the alert, or pauses, resumes or deletes the task; no leaves
 * everything as it was. Only the conversation's owner answers, once; the
 * task belongs to the company the conversation is for, and its time zone is
 * their browser's at the moment they say yes.
 */
export const answerProposal = tenantMutation({
  args: { messageId: v.id("messages"), yes: v.boolean(), timeZone: v.optional(v.string()) },
  returns: v.object({ status: v.union(v.literal("PENDING"), v.literal("DONE"), v.literal("DECLINED")), taskId: v.optional(v.id("hakkenTasks")) }),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    const proposal = message?.taskProposal;
    const thread = message ? await ctx.db.get(message.threadId) : null;
    if (!message || !proposal || !thread || thread.userId !== ctx.userId || !thread.companyId) {
      throw appError("NOT_FOUND", "That offer isn’t there any more.");
    }
    if (proposal.status !== "PENDING") return { status: proposal.status, ...(proposal.taskId ? { taskId: proposal.taskId } : {}) };
    const now = Date.now();
    if (!args.yes) {
      await ctx.db.patch(message._id, { taskProposal: { ...proposal, status: "DECLINED", answeredAt: now } });
      return { status: "DECLINED" as const };
    }

    let taskId = proposal.taskId;
    if (proposal.action === "RESEARCH") {
      // Found out in the background by the Research Agent, its write-up into this conversation (item 4.2).
      if (!proposal.research) throw appError("INVALID_INPUT", "That offer doesn’t say what to find out.");
      await ctx.scheduler.runAfter(0, internal.hakkenResearch.researchInternal, { threadId: thread._id, userId: ctx.userId, research: proposal.research });
    } else if (proposal.action === "CREATE") {
      // An alert watches a rule; a report (item 4.1) sends its pages each week.
      if (!proposal.measure || !proposal.target || !(proposal.condition || proposal.report) || !proposal.channels) {
        throw appError("INVALID_INPUT", "That offer is missing what it would watch.");
      }
      taskId = await insertTask(ctx, {
        companyId: thread.companyId,
        userId: ctx.userId,
        kind: proposal.report ? "REPORT" : "ALERT",
        title: proposal.title,
        measure: proposal.measure,
        target: proposal.target,
        ...(proposal.report ? { report: proposal.report } : { condition: proposal.condition }),
        ...(proposal.usual !== undefined ? { usual: proposal.usual } : {}),
        ...(proposal.timeOfDay ? { timeOfDay: proposal.timeOfDay } : {}),
        ...(args.timeZone ? { timeZone: args.timeZone } : {}),
        channels: proposal.channels,
        threadId: thread._id,
      });
    } else {
      if (!taskId) throw appError("INVALID_INPUT", "That offer doesn’t say which task.");
      const task = await ownTask(ctx, { userId: ctx.userId, companyId: thread.companyId }, taskId);
      if (proposal.action === "PAUSE" && task.state !== "PAUSED") await ctx.db.patch(task._id, pausedFields(now));
      if (proposal.action === "RESUME") await resume(ctx, task, now);
      if (proposal.action === "DELETE") await ctx.db.patch(task._id, { state: "DELETED", deletedAt: now, updatedAt: now, nextCheckAt: undefined });
    }
    await ctx.db.patch(message._id, { taskProposal: { ...proposal, status: "DONE", ...(taskId ? { taskId } : {}), answeredAt: now } });
    return { status: "DONE" as const, ...(taskId ? { taskId } : {}) };
  },
});
