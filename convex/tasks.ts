import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { moduleMutation, moduleQuery, publicMutation } from "./tenantFunctions";
import { CORE_MODULES } from "./utils/coreModules";
import { appError } from "./utils/appError";
import { getCurrentUser } from "./authz";
import { assertCanAccessThread } from "./chatService";

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
  if (!title) throw appError("INVALID_INPUT", "A task needs a title.");
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `A task title cannot exceed ${TASK_TITLE_MAX_LENGTH} characters.`);
  }

  const detail = args.detail?.trim();
  if (detail && detail.length > TASK_DETAIL_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Task detail cannot exceed ${TASK_DETAIL_MAX_LENGTH} characters.`);
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
  if (!assignee) throw appError("NOT_FOUND", "That person could not be found.");

  const assigneeCompanyId = assignee.impersonatingCompanyId ?? assignee.companyId;
  if (assigneeCompanyId !== companyId) {
    throw appError("INVALID_INPUT", "A task can only be assigned to somebody in this workspace.");
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

export const listTasks = moduleQuery({
  module: CORE_MODULES.tasks,
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

export const countOpenTasks = moduleQuery({
  module: CORE_MODULES.tasks,
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
export const listAssignableMembers = moduleQuery({
  module: CORE_MODULES.tasks,
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

/**
 * File a task on a person's say-so: the shared body of `createTask` and the
 * photo-action confirmation, so both doors validate, audit, and notify
 * identically.
 */
async function filePersonTask(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    userId: Id<"users"> | undefined;
    title: string;
    detail?: string;
    assigneeUserId?: Id<"users">;
    dueAt?: number;
    sourceUrl?: string;
  },
) {
  const { title, detail } = assertValidTaskFields(args);
  await assertAssigneeInTenant(ctx, args.assigneeUserId, args.companyId);

  const taskId = await ctx.db.insert("tasks", {
    companyId: args.companyId,
    title,
    detail,
    assigneeUserId: args.assigneeUserId,
    dueAt: args.dueAt,
    status: "OPEN",
    createdByUserId: args.userId,
    createdBySource: "PERSON",
    sourceUrl: args.sourceUrl,
    createdAt: Date.now(),
  });

  await writeTaskAudit(ctx, {
    actorId: args.userId,
    actionType: "CREATE_TASK",
    taskId,
    companyId: args.companyId,
    metadata: { assigned: Boolean(args.assigneeUserId) },
  });

  await notifyAssignee(ctx, {
    assigneeUserId: args.assigneeUserId,
    actorUserId: args.userId,
    companyId: args.companyId,
    taskId,
    title,
  });

  return taskId;
}

export const createTask = moduleMutation({
  module: CORE_MODULES.tasks,
  args: {
    title: v.string(),
    detail: v.optional(v.string()),
    assigneeUserId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    if (!companyId) throw appError("NO_ACTIVE_COMPANY", "A task needs a workspace.");

    return await filePersonTask(ctx, {
      companyId,
      userId,
      title: args.title,
      detail: args.detail,
      assigneeUserId: args.assigneeUserId,
      dueAt: args.dueAt,
      sourceUrl: args.sourceUrl,
    });
  },
});

/**
 * The one confirming tap that turns a photo's proposed follow-up into a task.
 *
 * The proposal was extracted server-side from the reply (photoActionService)
 * and is read back off the message here, so what gets filed is what was
 * proposed — a client cannot swap the text on the way through. Signed-in, it
 * files as the confirming person, audited and notified like any task of
 * theirs. From the anonymous widget it lands with the same per-company owner
 * the telephone's follow-ups go to: somebody always owns what a visitor
 * raises, or the bell rings for nobody.
 */
export const confirmPhotoAction = publicMutation({
  reason:
    "Anonymous widget visitors confirm a photo's proposed follow-up in their own thread; gated on the hashed widget session token, same as sendMessage.",
  args: {
    messageId: v.id("messages"),
    widgetAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.role !== "assistant") {
      throw appError("NOT_FOUND", "That suggestion could not be found.");
    }
    const thread = await ctx.db.get(message.threadId);
    if (!thread) throw appError("NOT_FOUND", "That conversation could not be found.");

    const current = await getCurrentUser(ctx);
    await assertCanAccessThread(ctx, thread, current, args.widgetAccessToken);

    const proposal = message.photoActionProposal;
    if (!proposal) throw appError("NOT_FOUND", "This message has no proposed action to confirm.");
    // A second tap files nothing twice.
    if (message.photoActionTaskId) return message.photoActionTaskId;

    const companyId = thread.companyId;
    // INVALID_INPUT, not NO_ACTIVE_COMPANY: it is the conversation that lacks
    // a workspace, not the caller — selecting one cannot make it fileable.
    if (!companyId) throw appError("INVALID_INPUT", "This conversation has no workspace to file a task into.");

    let taskId: Id<"tasks">;
    if (current?.user) {
      taskId = await filePersonTask(ctx, {
        companyId,
        userId: current.user._id,
        title: proposal.title,
        detail: `${proposal.detail}\n\nWhy: ${proposal.reasoning}`,
        assigneeUserId: current.user._id,
        sourceUrl: `/app/assistant/${thread._id}`,
      });
    } else {
      const assignee = await ctx.runQuery(internal.telephony.findCallAssignee, { companyId });
      taskId = await ctx.runMutation(internal.tasks.createTaskInternal, {
        companyId,
        title: proposal.title,
        detail:
          `${proposal.detail}\n\nWhy: ${proposal.reasoning}\n\n` +
          "Raised from a photo sent through the website widget.",
        ...(assignee ? { assigneeUserId: assignee } : {}),
        createdBySource: "AGENT" as const,
      });
    }

    await ctx.db.patch(message._id, { photoActionTaskId: taskId });
    return taskId;
  },
});

export const completeTask = moduleMutation({
  module: CORE_MODULES.tasks,
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw appError("NOT_FOUND", "That task could not be found.");

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

export const reopenTask = moduleMutation({
  module: CORE_MODULES.tasks,
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw appError("NOT_FOUND", "That task could not be found.");

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

export const cancelTask = moduleMutation({
  module: CORE_MODULES.tasks,
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    const task = await ctx.db.get(args.taskId);
    if (!task || task.companyId !== companyId) throw appError("NOT_FOUND", "That task could not be found.");

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
