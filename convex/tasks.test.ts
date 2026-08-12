import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * Tasks hand work to a named person, so the two things worth proving are the
 * tenant boundary — you cannot see or assign across it — and that the
 * lifecycle records who did what, because a to-do list nobody can audit is
 * not much use in a governed platform.
 */

async function seedWorkspaces() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    const companyB = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });

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
