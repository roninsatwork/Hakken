import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { mintWidgetEmbedPass } from "./utils/widgetEmbedPass";

// createWidgetThread requires a server-minted embed pass; tests mint their
// own with the same secret the mutation reads from the environment.
const TEST_EMBED_SECRET = "widget-embed-test-secret";
process.env.WIDGET_EMBED_SIGNING_SECRET = TEST_EMBED_SECRET;

/**
 * Tasks hand work to a named person, so the two things worth proving are the
 * tenant boundary — you cannot see or assign across it — and that the
 * lifecycle records who did what, because a to-do list nobody can audit is
 * not much use in a governed platform.
 */

async function seedWorkspaces() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    const companyB = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });

    const userA = await ctx.db.insert("users", {
      email: "a@test.com",
      role: "ADMIN",
      companyId: companyA,
      createdAt: Date.now(),
    });
    const colleagueA = await ctx.db.insert("users", {
      email: "colleague@test.com",
      role: "USER",
      companyId: companyA,
      createdAt: Date.now(),
    });
    const userB = await ctx.db.insert("users", {
      email: "b@test.com",
      role: "ADMIN",
      companyId: companyB,
      createdAt: Date.now(),
    });

    return { companyA, companyB, userA, colleagueA, userB };
  });

  return { t, ...ids };
}

const PAGE = { numItems: 20, cursor: null };

describe("tasks", () => {
  test("a task belongs to its workspace and is invisible to another", async () => {
    const { t, userA, userB } = await seedWorkspaces();

    await t.withIdentity({ subject: userA }).mutation(api.tasks.createTask, {
      title: "Contact Tesco Watford",
    });

    const mine = await t.withIdentity({ subject: userA }).query(api.tasks.listTasks, { paginationOpts: PAGE });
    expect(mine.page).toHaveLength(1);
    expect(mine.page[0].title).toBe("Contact Tesco Watford");

    const theirs = await t.withIdentity({ subject: userB }).query(api.tasks.listTasks, { paginationOpts: PAGE });
    expect(theirs.page).toHaveLength(0);
  });

  test("a task cannot be assigned to somebody in another workspace", async () => {
    const { t, userA, userB } = await seedWorkspaces();

    await expect(
      t.withIdentity({ subject: userA }).mutation(api.tasks.createTask, {
        title: "Sneak work across the boundary",
        assigneeUserId: userB,
      }),
    ).rejects.toThrow("only be assigned to somebody in this workspace");
  });

  test("completing a task records who finished it and when", async () => {
    const { t, userA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    const taskId = await asUser.mutation(api.tasks.createTask, { title: "Call Priya back" });
    await asUser.mutation(api.tasks.completeTask, { taskId });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({ status: "DONE", completedByUserId: userA });
    expect(task?.completedAt).toEqual(expect.any(Number));
  });

  test("reopening clears who finished it rather than leaving a stale name", async () => {
    const { t, userA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    const taskId = await asUser.mutation(api.tasks.createTask, { title: "Chase the Bath order" });
    await asUser.mutation(api.tasks.completeTask, { taskId });
    await asUser.mutation(api.tasks.reopenTask, { taskId });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("OPEN");
    expect(task?.completedAt).toBeUndefined();
    expect(task?.completedByUserId).toBeUndefined();
  });

  test("a cancelled task stays in the history rather than vanishing", async () => {
    const { t, userA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    const taskId = await asUser.mutation(api.tasks.createTask, { title: "Drop this one" });
    await asUser.mutation(api.tasks.cancelTask, { taskId });

    const cancelled = await asUser.query(api.tasks.listTasks, { paginationOpts: PAGE, status: "CANCELLED" });
    expect(cancelled.page).toHaveLength(1);
    // What the workspace decided not to do is part of its record.
    expect(await t.run(async (ctx) => ctx.db.get(taskId))).not.toBeNull();
  });

  test("the list can narrow to just my own tasks", async () => {
    const { t, userA, colleagueA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    await asUser.mutation(api.tasks.createTask, { title: "Mine", assigneeUserId: userA });
    await asUser.mutation(api.tasks.createTask, { title: "Theirs", assigneeUserId: colleagueA });

    const all = await asUser.query(api.tasks.listTasks, { paginationOpts: PAGE });
    expect(all.page).toHaveLength(2);

    const mine = await asUser.query(api.tasks.listTasks, { paginationOpts: PAGE, mineOnly: true });
    expect(mine.page.map((task) => task.title)).toEqual(["Mine"]);
  });

  test("every lifecycle step leaves an audit entry", async () => {
    const { t, userA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    const taskId = await asUser.mutation(api.tasks.createTask, { title: "Auditable" });
    await asUser.mutation(api.tasks.completeTask, { taskId });

    const actions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect())
        .filter((row) => row.entityType === "tasks")
        .map((row) => row.actionType),
    );
    expect(actions).toEqual(["CREATE_TASK", "COMPLETE_TASK"]);
  });

  test("an empty title is refused before anything is written", async () => {
    const { t, userA } = await seedWorkspaces();

    await expect(
      t.withIdentity({ subject: userA }).mutation(api.tasks.createTask, { title: "   " }),
    ).rejects.toThrow("needs a title");
  });

  test("a machine-raised task records its source rather than claiming a person made it", async () => {
    const { t, companyA, userA } = await seedWorkspaces();

    const taskId = await t.mutation(internal.tasks.createTaskInternal, {
      companyId: companyA,
      title: "Raised by the research agent",
      assigneeUserId: userA,
      createdBySource: "AGENT",
      sourceRunId: "run_123",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({ createdBySource: "AGENT", sourceRunId: "run_123" });
    // No person is credited with work a machine did.
    expect(task?.createdByUserId).toBeUndefined();
  });

  test("the task list returns every visible field without internal lifecycle metadata", async () => {
    const { t, companyA, userA } = await seedWorkspaces();
    const dueAt = Date.now() + 86_400_000;

    await t.mutation(internal.tasks.createTaskInternal, {
      companyId: companyA,
      title: "Review the call follow-up",
      detail: "Check the promised delivery date.",
      assigneeUserId: userA,
      dueAt,
      createdBySource: "AGENT",
      sourceRunId: "run_internal_only",
      sourceUrl: "/app/calls/example",
    });

    const listed = await t.withIdentity({ subject: userA }).query(api.tasks.listTasks, {
      paginationOpts: PAGE,
    });

    expect(listed.page[0]).toEqual({
      _id: expect.any(String),
      title: "Review the call follow-up",
      detail: "Check the promised delivery date.",
      assigneeUserId: userA,
      dueAt,
      status: "OPEN",
      createdBySource: "AGENT",
      sourceUrl: "/app/calls/example",
    });
    expect(listed.page[0]).not.toHaveProperty("companyId");
    expect(listed.page[0]).not.toHaveProperty("createdAt");
    expect(listed.page[0]).not.toHaveProperty("createdByUserId");
    expect(listed.page[0]).not.toHaveProperty("sourceRunId");
  });

  test("a machine cannot assign work across the tenant boundary either", async () => {
    const { t, companyA, userB } = await seedWorkspaces();

    await expect(
      t.mutation(internal.tasks.createTaskInternal, {
        companyId: companyA,
        title: "Cross-tenant by machine",
        assigneeUserId: userB,
        createdBySource: "AGENT",
      }),
    ).rejects.toThrow("only be assigned to somebody in this workspace");
  });
});

/**
 * A task nobody is told about is a task nobody does, which is the whole
 * reason tasks and notifications were built together.
 */
describe("assigning tells the person", () => {
  test("the assignee gets a notification pointing at their tasks", async () => {
    const { t, userA, colleagueA } = await seedWorkspaces();

    await t.withIdentity({ subject: userA }).mutation(api.tasks.createTask, {
      title: "Contact Sainsbury's Bath",
      assigneeUserId: colleagueA,
    });

    const theirs = await t
      .withIdentity({ subject: colleagueA })
      .query(api.notifications.listMine, { paginationOpts: PAGE });

    expect(theirs.page).toHaveLength(1);
    expect(theirs.page[0]).toMatchObject({
      kind: "TASK_ASSIGNED",
      title: "Contact Sainsbury's Bath",
      href: "/app/tasks",
    });
  });

  test("assigning to yourself does not notify you about your own action", async () => {
    const { t, userA } = await seedWorkspaces();
    const asUser = t.withIdentity({ subject: userA });

    await asUser.mutation(api.tasks.createTask, { title: "Mine to do", assigneeUserId: userA });

    const mine = await asUser.query(api.notifications.listMine, { paginationOpts: PAGE });
    expect(mine.page).toHaveLength(0);
  });

  test("an unassigned task notifies nobody", async () => {
    const { t, userA, colleagueA } = await seedWorkspaces();

    await t.withIdentity({ subject: userA }).mutation(api.tasks.createTask, { title: "Nobody's yet" });

    const theirs = await t
      .withIdentity({ subject: colleagueA })
      .query(api.notifications.listMine, { paginationOpts: PAGE });
    expect(theirs.page).toHaveLength(0);
  });

  test("a task raised by an agent still reaches its assignee", async () => {
    const { t, companyA, colleagueA } = await seedWorkspaces();

    await t.mutation(internal.tasks.createTaskInternal, {
      companyId: companyA,
      title: "Check this phone number",
      assigneeUserId: colleagueA,
      createdBySource: "AGENT",
      sourceRunId: "run_abc",
    });

    const theirs = await t
      .withIdentity({ subject: colleagueA })
      .query(api.notifications.listMine, { paginationOpts: PAGE });
    expect(theirs.page.map((row) => row.title)).toEqual(["Check this phone number"]);
  });
});

/**
 * The agent and the workflow both name a person by email rather than by id,
 * because an id is a thing a model can invent or lift from a document it
 * read. The email is resolved against this workspace's own members only.
 */
describe("the machine doors", () => {
  test("an agent raises a task and it reaches the named colleague", async () => {
    const { t, companyA, colleagueA } = await seedWorkspaces();

    const result = await t.mutation(internal.tasks.createTaskFromAgent, {
      companyId: companyA,
      title: "Check the Bath phone number",
      assigneeEmail: "COLLEAGUE@test.com",
      runId: "run_9",
    });

    expect(result.assigned).toBe(true);
    const task = await t.run(async (ctx) => ctx.db.get(result.taskId));
    expect(task).toMatchObject({ assigneeUserId: colleagueA, createdBySource: "AGENT", sourceRunId: "run_9" });
  });

  test("an address from another workspace leaves the task unassigned rather than crossing the boundary", async () => {
    const { t, companyA } = await seedWorkspaces();

    const result = await t.mutation(internal.tasks.createTaskFromAgent, {
      companyId: companyA,
      title: "Try to reach across",
      assigneeEmail: "b@test.com",
    });

    // Raised, because work nobody owns is still worth raising — but never
    // handed to somebody outside the workspace.
    expect(result.assigned).toBe(false);
    const task = await t.run(async (ctx) => ctx.db.get(result.taskId));
    expect(task?.assigneeUserId).toBeUndefined();
    expect(task?.companyId).toBe(companyA);
  });

  test("a workflow raises a task recorded as coming from a workflow", async () => {
    const { t, companyA, userA } = await seedWorkspaces();
    const workflowId = await t.run(async (ctx) =>
      ctx.db.insert("workflows", {
        name: "Chase under-served sites",
        isActive: true,
        triggerType: "MANUAL" as const,
        createdBy: userA,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await t.mutation(internal.tasks.createTaskFromWorkflow, {
      companyId: companyA,
      title: "Chase Sainsbury's Bath",
      assigneeEmail: "a@test.com",
      workflowId,
    });

    const task = await t.run(async (ctx) => ctx.db.get(result.taskId));
    expect(task).toMatchObject({ createdBySource: "WORKFLOW", assigneeUserId: userA });
  });
});

describe("confirming a photo action", () => {
  const PROPOSAL = {
    title: "Reorder printer toner",
    detail: "The photo shows an empty toner box.",
    reasoning: "The box in the photo is marked empty.",
  };

  /** An assistant reply carrying a proposal, in a thread of user A's. */
  async function seedProposalMessage(
    t: Awaited<ReturnType<typeof seedWorkspaces>>["t"],
    args: { companyId: Awaited<ReturnType<typeof seedWorkspaces>>["companyA"]; userId: Awaited<ReturnType<typeof seedWorkspaces>>["userA"] },
  ) {
    return await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("threads", {
        userId: args.userId,
        companyId: args.companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const messageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "That looks like an empty toner box.",
        photoActionProposal: PROPOSAL,
        createdAt: Date.now(),
      });
      return { threadId, messageId };
    });
  }

  test("a signed-in tap files the proposal as that person, faithfully", async () => {
    const { t, companyA, userA } = await seedWorkspaces();
    const { messageId } = await seedProposalMessage(t, { companyId: companyA, userId: userA });

    const taskId = await t
      .withIdentity({ subject: userA })
      .mutation(api.tasks.confirmPhotoAction, { messageId });

    const { task, message, audits } = await t.run(async (ctx) => ({
      task: await ctx.db.get(taskId),
      message: await ctx.db.get(messageId),
      audits: await ctx.db.query("auditLogs").collect(),
    }));

    // Pre-fill fidelity: what was proposed is what was filed.
    expect(task).toMatchObject({
      title: PROPOSAL.title,
      companyId: companyA,
      status: "OPEN",
      createdByUserId: userA,
      createdBySource: "PERSON",
      assigneeUserId: userA,
    });
    expect(task?.detail).toContain(PROPOSAL.detail);
    expect(task?.detail).toContain(PROPOSAL.reasoning);
    // The message remembers the filing, so the chip can show it and a second
    // tap cannot duplicate.
    expect(message?.photoActionTaskId).toBe(taskId);
    expect(audits.some((a) => a.actionType === "CREATE_TASK" && a.actorId === userA)).toBe(true);

    // Idempotent: tapping again returns the same task and files nothing new.
    const again = await t
      .withIdentity({ subject: userA })
      .mutation(api.tasks.confirmPhotoAction, { messageId });
    expect(again).toBe(taskId);
    const tasks = await t.run(async (ctx) => await ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(1);
  });

  test("nothing is filed without the tap, and no proposal means no filing", async () => {
    const { t, companyA, userA } = await seedWorkspaces();
    const { messageId } = await seedProposalMessage(t, { companyId: companyA, userId: userA });

    // The proposal sat on the message; merely existing filed nothing.
    let tasks = await t.run(async (ctx) => await ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(0);

    // A message with no proposal refuses.
    const bareMessageId = await t.run(async (ctx) => {
      const message = await ctx.db.get(messageId);
      return await ctx.db.insert("messages", {
        threadId: message!.threadId,
        role: "assistant",
        content: "No photo here.",
        createdAt: Date.now(),
      });
    });
    await expect(
      t.withIdentity({ subject: userA }).mutation(api.tasks.confirmPhotoAction, { messageId: bareMessageId }),
    ).rejects.toThrow("no proposed action");

    tasks = await t.run(async (ctx) => await ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(0);
  });

  test("another workspace's member cannot confirm somebody else's proposal", async () => {
    const { t, companyA, userA, userB } = await seedWorkspaces();
    const { messageId } = await seedProposalMessage(t, { companyId: companyA, userId: userA });

    await expect(
      t.withIdentity({ subject: userB }).mutation(api.tasks.confirmPhotoAction, { messageId }),
    ).rejects.toThrow();
  });

  test("an anonymous widget tap files to the workspace's call owner, with the bell", async () => {
    const { t, companyA, userA } = await seedWorkspaces();

    // A widget thread with a real session token, the way the widget creates one.
    const { widgetId } = await t.run(async (ctx) => {
      const widgetId = await ctx.db.insert("widgets", {
        companyId: companyA,
        name: "Website Bot",
        allowedDomains: ["example.com"],
        isActive: true,
        createdBy: userA,
        createdAt: Date.now(),
      });
      return { widgetId };
    });
    const created = await t.mutation(api.widgets.createWidgetThread, {
      widgetId,
      sourceUrl: "https://support.example.com/help",
      embedPass: await mintWidgetEmbedPass({
        widgetId,
        embedHost: "support.example.com",
        secret: TEST_EMBED_SECRET,
      }),
    });
    if ("refused" in created) throw new Error(`widget session refused: ${created.refused}`);
    const { threadId, accessToken } = created;
    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "That looks like an empty toner box.",
        photoActionProposal: PROPOSAL,
        createdAt: Date.now(),
      })
    );

    // The wrong token is refused; nothing is filed.
    await expect(
      t.mutation(api.tasks.confirmPhotoAction, { messageId, widgetAccessToken: "wrong-token" }),
    ).rejects.toThrow();

    const taskId = await t.mutation(api.tasks.confirmPhotoAction, {
      messageId,
      widgetAccessToken: accessToken,
    });

    const { task, notifications } = await t.run(async (ctx) => ({
      task: await ctx.db.get(taskId),
      notifications: await ctx.db.query("notifications").collect(),
    }));

    // Files to the same per-company owner the telephone's follow-ups go to —
    // company A's admin — and rings their bell.
    expect(task).toMatchObject({
      companyId: companyA,
      title: PROPOSAL.title,
      assigneeUserId: userA,
      createdBySource: "AGENT",
    });
    expect(task?.detail).toContain("website widget");
    expect(notifications.some((n) => n.userId === userA && n.kind === "TASK_ASSIGNED")).toBe(true);
  });
});
