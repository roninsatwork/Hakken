import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";

/**
 * Tasks: work the platform holds for a named person.
 *
 * Sonae could find things and never ask anyone to act on them — an agent
 * finished, wrote an answer into a conversation nobody returned to, and the
 * finding died there. A task is the missing half: a title, a person, a date,
 * and a state.
 *
 * Not an approval. Nothing blocks on a task and no run waits for one; the
 * moment something gates on it, that is an approval and those already exist
 * in `agentRunApprovals`.
 */

const taskStatusValidator = v.union(v.literal("OPEN"), v.literal("DONE"), v.literal("CANCELLED"));

const TASK_TITLE_MAX_LENGTH = 200;
const TASK_DETAIL_MAX_LENGTH = 2000;

export function assertValidTaskFields(args: { title: string; detail?: string }) {
  const title = args.title.trim();
  if (!title) throw new Error("A task needs a title.");
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw new Error(`A task title cannot exceed ${TASK_TITLE_MAX_LENGTH} characters.`);
  }

  const detail = args.detail?.trim();
  if (detail && detail.length > TASK_DETAIL_MAX_LENGTH) {
    throw new Error(`Task detail cannot exceed ${TASK_DETAIL_MAX_LENGTH} characters.`);
  }

  return { title, detail: detail || undefined };
}

/**
 * You may only hand work to somebody in your own tenant.
 *
 * Checked against the assignee's own record rather than against anything the
 * caller passed, because the caller may be an agent repeating an id a model
 * produced.
 */
async function assertAssigneeInTenant(
  ctx: MutationCtx,
  assigneeUserId: Id<"users"> | undefined,
  companyId: Id<"companies">,
) {
  if (!assigneeUserId) return;
  const assignee = await ctx.db.get(assigneeUserId);
  if (!assignee) throw new Error("That person could not be found.");

  const assigneeCompanyId = assignee.impersonatingCompanyId ?? assignee.companyId;
  if (assigneeCompanyId !== companyId) {
    throw new Error("A task can only be assigned to somebody in this workspace.");
  }
}

async function writeTaskAudit(
  ctx: MutationCtx,
  args: {
    actorId?: Id<"users">;
    actionType: string;
    taskId: Id<"tasks">;
    companyId: Id<"companies">;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLogs", {
    actorId: args.actorId,
    actionType: args.actionType,
    entityId: args.taskId,
    entityType: "tasks",
    companyId: args.companyId,
    timestamp: Date.now(),
    ...(args.metadata ? { metadata: JSON.stringify(args.metadata) } : {}),
  });
}

/**
 * Tell the assignee, unless they assigned it to themselves.
 *
 * Raised from the mutation that did the assigning, never from a browser, so
 * the notification cannot claim an assignment that did not happen.
 */
async function notifyAssignee(
  ctx: MutationCtx,
  args: {
    assigneeUserId: Id<"users"> | undefined;
    actorUserId?: Id<"users">;
    companyId: Id<"companies">;
    taskId: Id<"tasks">;
    title: string;
  },
) {
  if (!args.assigneeUserId) return;
  if (args.assigneeUserId === args.actorUserId) return;

  await ctx.runMutation(internal.notifications.notifyUserInternal, {
    userId: args.assigneeUserId,
    companyId: args.companyId,
    kind: "TASK_ASSIGNED",
    title: args.title,
    href: "/app/tasks",
  });
}

export const listTasks = tenantQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(taskStatusValidator),
    mineOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    if (!companyId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // Filtering after the page keeps the query on one index; a short page is
    // better than a second scan, and the caller pages on.
    const results = args.mineOnly
      ? await ctx.db
          .query("tasks")
          .withIndex("by_assignee_status", (q) =>
            args.status ? q.eq("assigneeUserId", userId).eq("status", args.status) : q.eq("assigneeUserId", userId),
          )
          .order("asc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("tasks")
          .withIndex("by_company_status", (q) =>
            args.status ? q.eq("companyId", companyId).eq("status", args.status) : q.eq("companyId", companyId),
          )
          .order("asc")
          .paginate(args.paginationOpts);

    return {
      ...results,
      // The assignee index is not tenant-scoped on its own, so the boundary is
      // reasserted here rather than trusted from the index.
      page: results.page.filter((task) => task.companyId === companyId),
    };
  },
});

export const countOpenTasks = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return 0;

    // Bounded on purpose: the badge only needs to know "some" versus "a lot",
    // and an unbounded count would scan every task the workspace ever made.
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "OPEN"))
      .take(100);

    return open.length;
  },
});

/**
 * Who a task can be handed to: the people in your own workspace.
 *
 * Deliberately not `users.getUsersByCompany`, which is admin-only and paged —
 * an ordinary person assigning a task needs to see their colleagues' names
 * without being an administrator. Only the fields a picker needs are
 * returned, so this never becomes a back door to the user directory.
 */
export const listAssignableMembers = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];

    const members = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(200);

    return members.map((member) => ({
      _id: member._id,
      name: member.name,
      email: member.email,
    }));
  },
});

export const createTask = tenantMutation({
  args: {
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeUserId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    if (!companyId) throw new Error("A task needs a workspace.");

    const { title, detail } = assertValidTaskFields(args);
    await assertAssigneeInTenant(ctx, args.assigneeUserId, companyId);

    const taskId = await ctx.db.insert("tasks", {
      companyId,
      title,
      detail,
      assigneeUserId: args.assigneeUserId,
      dueAt: args.dueAt,
      status: "OPEN",
      createdByUserId: userId,
      createdBySource: "PERSON",
      sourceUrl: args.sourceUrl,
      createdAt: Date.now(),
    });

    await writeTaskAudit(ctx, {
      actorId: userId,
      actionType: "CREATE_TASK",
      taskId,
      companyId,
      metadata: { assigned: Boolean(args.assigneeUserId) },
    });

    await notifyAssignee(ctx, {
      assigneeUserId: args.assigneeUserId,
      actorUserId: userId,
      companyId,
      taskId,
      title,
    });

    return taskId;
  },
});

export const completeTask = tenantMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw new Error("That task could not be found.");

    await ctx.db.patch(args.taskId, {
      status: "DONE",
      completedAt: Date.now(),
      completedByUserId: userId,
    });

    await writeTaskAudit(ctx, {
      actorId: userId,
      actionType: "COMPLETE_TASK",
      taskId: args.taskId,
      companyId: task.companyId,
    });
  },
});

export const reopenTask = tenantMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw new Error("That task could not be found.");

    // Who finished it is cleared with it; leaving a stale name on a reopened
    // task reads as though that person is still responsible for it.
    await ctx.db.patch(args.taskId, {
      status: "OPEN",
      completedAt: undefined,
      completedByUserId: undefined,
    });

    await writeTaskAudit(ctx, {
      actorId: userId,
      actionType: "REOPEN_TASK",
      taskId: args.taskId,
      companyId: task.companyId,
    });
  },
});

export const cancelTask = tenantMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw new Error("That task could not be found.");

    // Cancelled, not deleted: a task that was raised and dropped is part of
    // the history of what the workspace decided not to do.
    await ctx.db.patch(args.taskId, { status: "CANCELLED" });

    await writeTaskAudit(ctx, {
      actorId: userId,
      actionType: "CANCEL_TASK",
      taskId: args.taskId,
      companyId: task.companyId,
    });
  },
});

/**
 * The agent's door.
 *
 * An agent names a person by email rather than by id, because an id is a
 * thing a model can invent or lift from a document it read. The email is
 * resolved against this tenant's own members and nothing else; an address
 * that is not one of them leaves the task unassigned rather than failing the
 * run, since a task nobody owns is still worth raising.
 */
async function findMemberByEmail(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  email: string | undefined,
): Promise<Id<"users"> | undefined> {
  if (!email) return undefined;
  const wanted = email.trim().toLowerCase();
  const members = await ctx.db
    .query("users")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(200);
  return members.find((member) => member.email?.toLowerCase() === wanted)?._id;
}

export const createTaskFromAgent = internalMutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeEmail: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ taskId: Id<"tasks">; assigned: boolean }> => {
    const assigneeUserId = await findMemberByEmail(ctx, args.companyId, args.assigneeEmail);

    const taskId: Id<"tasks"> = await ctx.runMutation(internal.tasks.createTaskInternal, {
      companyId: args.companyId,
      title: args.title,
      detail: args.detail,
      assigneeUserId,
      dueAt: args.dueAt,
      createdBySource: "AGENT",
      sourceRunId: args.runId,
      sourceUrl: "/app/tasks",
    });

    return { taskId, assigned: Boolean(assigneeUserId) };
  },
});

/**
 * The workflow's door.
 *
 * Same rule as the agent's: a person is named by email and resolved against
 * this tenant's own members, so a template pulling a value out of run data
 * cannot address work into another workspace.
 */
export const createTaskFromWorkflow = internalMutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeEmail: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args): Promise<{ taskId: Id<"tasks">; assigned: boolean }> => {
    const assigneeUserId = await findMemberByEmail(ctx, args.companyId, args.assigneeEmail);

    const taskId: Id<"tasks"> = await ctx.runMutation(internal.tasks.createTaskInternal, {
      companyId: args.companyId,
      title: args.title,
      detail: args.detail,
      assigneeUserId,
      dueAt: args.dueAt,
      createdBySource: "WORKFLOW",
      sourceRunId: args.workflowId,
      sourceUrl: "/app/tasks",
    });

    return { taskId, assigned: Boolean(assigneeUserId) };
  },
});

/**
 * The single door agents and workflows come through.
 *
 * Internal, so nothing in a browser can reach it, and the tenant is passed by
 * the caller that already resolved it rather than by anything a model said.
 */
export const createTaskInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeUserId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    createdBySource: v.union(v.literal("AGENT"), v.literal("WORKFLOW")),
    sourceRunId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { title, detail } = assertValidTaskFields(args);
    await assertAssigneeInTenant(ctx, args.assigneeUserId, args.companyId);

    const taskId = await ctx.db.insert("tasks", {
      companyId: args.companyId,
      title,
      detail,
      assigneeUserId: args.assigneeUserId,
      dueAt: args.dueAt,
      status: "OPEN",
      createdBySource: args.createdBySource,
      sourceRunId: args.sourceRunId,
      sourceUrl: args.sourceUrl,
      createdAt: Date.now(),
    });

    await writeTaskAudit(ctx, {
      actionType: "CREATE_TASK",
      taskId,
      companyId: args.companyId,
      metadata: { source: args.createdBySource, sourceRunId: args.sourceRunId },
    });

    await notifyAssignee(ctx, {
      assigneeUserId: args.assigneeUserId,
      companyId: args.companyId,
      taskId,
      title,
    });

    return taskId;
  },
});
