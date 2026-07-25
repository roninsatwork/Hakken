import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

// Error text standardised to "Unauthorized" when these moved to the shared
// superAdmin builders. No client depends on the old wording, and a uniform
// message avoids hinting at which subsystem rejected the caller.
describe("Scheduler Authorization", () => {
  test("standard users cannot manage schedules but super admins can create one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId, workflowId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Scheduled Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { userId, superAdminId, workflowId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.query(api.scheduler.getSchedules)).rejects.toThrow("Unauthorized");

    await expect(
      userClient.mutation(api.scheduler.createSchedule, {
        name: "Rogue Schedule",
        workflowId,
        intervalStr: "daily",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized");

    const scheduleId = await superAdminClient.mutation(api.scheduler.createSchedule, {
      name: "Daily Workflow",
      workflowId,
      intervalStr: "daily",
      isActive: true,
    });
    const schedule = await t.run(async (ctx) => await ctx.db.get(scheduleId));

    expect(schedule?.createdBy).toBe(superAdminId);
    expect(schedule?.workflowId).toBe(workflowId);
    expect(schedule?.nextRunAt).toEqual(expect.any(Number));
  });

  test("super admins can update, toggle, delete, manually run, and inspect schedules and executions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, workflowId, agentId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        name: "Super Admin",
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Scheduled Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Scheduled Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { superAdminId, workflowId, agentId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      superAdminClient.mutation(api.scheduler.createSchedule, {
        name: "Missing Target",
        intervalStr: "daily",
        isActive: true,
      })
    ).rejects.toThrow("Must select a target payload");

    const workflowScheduleId = await superAdminClient.mutation(api.scheduler.createSchedule, {
      name: "Daily Workflow",
      workflowId,
      intervalStr: "daily",
      isActive: true,
    });
    const agentScheduleId = await superAdminClient.mutation(api.scheduler.createSchedule, {
      name: "Weekly Agent",
      agentId,
      intervalStr: "weekly",
      isActive: false,
    });

    const schedules = await superAdminClient.query(api.scheduler.getSchedules, {});
    expect(schedules.map((schedule) => schedule.targetName)).toEqual(["Scheduled Agent", "Scheduled Workflow"]);
    expect(await superAdminClient.query(api.scheduler.getSchedule, { scheduleId: workflowScheduleId })).toMatchObject({
      name: "Daily Workflow",
      workflowId,
      nextRunAt: expect.any(Number),
    });

    await expect(
      superAdminClient.mutation(api.scheduler.updateSchedule, {
        scheduleId: workflowScheduleId,
        name: "Updated Agent Schedule",
        agentId,
        intervalStr: "monthly",
        isActive: false,
      })
    ).resolves.toBe(true);
    await expect(
      superAdminClient.mutation(api.scheduler.updateSchedule, {
        scheduleId: workflowScheduleId,
        name: "Missing Target",
        intervalStr: "monthly",
        isActive: false,
      })
    ).rejects.toThrow("Must select a target payload");
    await expect(superAdminClient.mutation(api.scheduler.toggleSchedule, { scheduleId: workflowScheduleId, isActive: true })).resolves.toBe(
      true
    );
    expect(await superAdminClient.query(api.scheduler.getSchedule, { scheduleId: workflowScheduleId })).toMatchObject({
      isActive: true,
      nextRunAt: expect.any(Number),
    });

    await expect(superAdminClient.mutation(api.scheduler.manualRunSchedule, {})).rejects.toThrow(
      "Cannot run: no target specified."
    );
    const executionId = await superAdminClient.mutation(api.scheduler.manualRunSchedule, { workflowId });
    const agentExecutionId = await superAdminClient.mutation(api.scheduler.manualRunSchedule, { agentId });
    await t.mutation(internal.scheduler.completeSimulation, { executionId, success: false });

    const executions = await superAdminClient.query(api.scheduler.getWorkflowExecutions, {});
    const execution = await superAdminClient.query(api.scheduler.getWorkflowExecution, { executionId });
    const agentExecution = await superAdminClient.query(api.scheduler.getWorkflowExecution, { executionId: agentExecutionId });
    const agentRun = await t.run(async (ctx) => {
      if (!agentExecution?.agentRunId) return null;
      return await ctx.db.get(agentExecution.agentRunId);
    });

    expect(executions.some((entry) => entry._id === executionId)).toBe(true);
    expect(executions.some((entry) => entry._id === agentExecutionId)).toBe(true);
    expect(execution).toMatchObject({
      _id: executionId,
      status: "FAILED",
      workflowName: "Scheduled Workflow",
      startedByName: "Super Admin",
    });
    expect(agentExecution).toMatchObject({
      _id: agentExecutionId,
      agentId,
      agentRunId: expect.any(String),
      status: "RUNNING",
      startedByName: "Super Admin",
    });
    expect(agentRun).toMatchObject({
      agentId,
      triggerType: "MANUAL",
      status: "QUEUED",
      userId: superAdminId,
      objective: "Manual run: Scheduled Agent",
    });
    expect(execution?.state).toBe(JSON.stringify({ note: "Autonomous backend heartbeat succeeded." }));
    expect(execution?.steps).toEqual([]);

    await expect(superAdminClient.mutation(api.scheduler.deleteSchedule, { scheduleId: agentScheduleId })).resolves.toBe(true);
    expect(await superAdminClient.query(api.scheduler.getSchedule, { scheduleId: agentScheduleId })).toBeNull();
  });

  test("due agent schedules create linked durable agent runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { scheduleId, agentId, superAdminId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        name: "Super Admin",
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Scheduled Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const scheduleId = await ctx.db.insert("schedules", {
        name: "Daily Agent",
        agentId,
        intervalStr: "daily",
        isActive: true,
        nextRunAt: Date.now() - 1000,
        createdAt: Date.now() - 2000,
        createdBy: superAdminId,
      });

      return { scheduleId, agentId, superAdminId };
    });

    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

    const state = await t.run(async (ctx) => {
      const schedule = await ctx.db.get(scheduleId);
      const runs = await ctx.db.query("agentRuns").withIndex("by_schedule_started", (q) => q.eq("scheduleId", scheduleId)).collect();
      const executions = await ctx.db.query("workflowExecutions").withIndex("by_startedAt").collect();

      return { schedule, runs, executions };
    });

    expect(state.schedule).toMatchObject({
      lastRunTs: expect.any(Number),
      nextRunAt: expect.any(Number),
    });
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({
      agentId,
      scheduleId,
      triggerType: "SCHEDULE",
      status: "QUEUED",
      userId: superAdminId,
      objective: "Scheduled run: Daily Agent",
    });
    expect(state.executions.some((execution) => execution.agentRunId === state.runs[0]._id)).toBe(true);
  });

  test("schedule and execution admin lists stay bounded and newest first", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, workflowId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        name: "Super Admin",
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "High Volume Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      for (let i = 0; i < 120; i += 1) {
        await ctx.db.insert("schedules", {
          name: `Schedule ${i}`,
          workflowId,
          intervalStr: "daily",
          isActive: true,
          createdAt: i,
          createdBy: superAdminId,
        });
      }

      for (let i = 0; i < 75; i += 1) {
        await ctx.db.insert("workflowExecutions", {
          workflowId,
          triggerType: "MANUAL",
          status: "SUCCESS",
          startedAt: i,
          completedAt: i + 1,
          startedBy: superAdminId,
        });
      }

      return { superAdminId, workflowId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const schedules = await superAdminClient.query(api.scheduler.getSchedules, {});
    expect(schedules).toHaveLength(100);
    expect(schedules[0]).toMatchObject({ name: "Schedule 119", workflowName: "High Volume Workflow" });
    expect(schedules.at(-1)).toMatchObject({ name: "Schedule 20" });

    const executions = await superAdminClient.query(api.scheduler.getWorkflowExecutions, {});
    expect(executions).toHaveLength(50);
    expect(executions[0]).toMatchObject({
      workflowId,
      workflowName: "High Volume Workflow",
      startedByName: "Super Admin",
      startedAt: 74,
    });
    expect(executions.at(-1)).toMatchObject({ startedAt: 25 });
  });

  test("dispatcher reads due active schedules and advances nextRunAt", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { dueScheduleId, futureScheduleId, dueAgentScheduleId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        name: "Super Admin",
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const dueWorkflowId = await ctx.db.insert("workflows", {
        name: "Due Workflow",
        isActive: true,
        triggerType: "SCHEDULE",
        nodes: JSON.stringify([{ id: "start", type: "triggerNode" }]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const futureWorkflowId = await ctx.db.insert("workflows", {
        name: "Future Workflow",
        isActive: true,
        triggerType: "SCHEDULE",
        nodes: JSON.stringify([{ id: "start", type: "triggerNode" }]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const dueAgentId = await ctx.db.insert("agents", {
        name: "Due Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const dueScheduleId = await ctx.db.insert("schedules", {
        name: "Due",
        workflowId: dueWorkflowId,
        intervalStr: "hourly",
        isActive: true,
        nextRunAt: Date.now() - 1_000,
        createdAt: 1,
        createdBy: superAdminId,
      });
      const futureScheduleId = await ctx.db.insert("schedules", {
        name: "Future",
        workflowId: futureWorkflowId,
        intervalStr: "hourly",
        isActive: true,
        nextRunAt: Date.now() + 60 * 60 * 1000,
        createdAt: 2,
        createdBy: superAdminId,
      });
      const dueAgentScheduleId = await ctx.db.insert("schedules", {
        name: "Due Agent",
        agentId: dueAgentId,
        intervalStr: "hourly",
        isActive: true,
        nextRunAt: Date.now() - 1_000,
        createdAt: 3,
        createdBy: superAdminId,
      });

      return { dueScheduleId, futureScheduleId, dueAgentScheduleId };
    });

    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

    const { dueSchedule, futureSchedule, dueAgentSchedule, executions } = await t.run(async (ctx) => ({
      dueSchedule: await ctx.db.get(dueScheduleId),
      futureSchedule: await ctx.db.get(futureScheduleId),
      dueAgentSchedule: await ctx.db.get(dueAgentScheduleId),
      executions: await ctx.db.query("workflowExecutions").collect(),
    }));

    expect(executions).toHaveLength(2);
    expect(executions.some((execution) => execution.agentId)).toBe(true);
    expect(dueSchedule?.lastRunTs).toEqual(expect.any(Number));
    expect(dueSchedule?.nextRunAt).toBeGreaterThan(Date.now());
    expect(dueAgentSchedule?.lastRunTs).toEqual(expect.any(Number));
    expect(dueAgentSchedule?.nextRunAt).toBeGreaterThan(Date.now());
    expect(futureSchedule?.lastRunTs).toBeUndefined();
  });
});
