import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

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

    await expect(userClient.query(api.scheduler.getSchedules)).rejects.toThrow("Unauthorized System Access");

    await expect(
      userClient.mutation(api.scheduler.createSchedule, {
        name: "Rogue Schedule",
        workflowId,
        intervalStr: "daily",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized System Access");

    const scheduleId = await superAdminClient.mutation(api.scheduler.createSchedule, {
      name: "Daily Workflow",
      workflowId,
      intervalStr: "daily",
      isActive: true,
    });
    const schedule = await t.run(async (ctx) => await ctx.db.get(scheduleId));

    expect(schedule?.createdBy).toBe(superAdminId);
    expect(schedule?.workflowId).toBe(workflowId);
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

    await expect(superAdminClient.mutation(api.scheduler.manualRunSchedule, {})).rejects.toThrow(
      "Cannot run: no target specified."
    );
    const executionId = await superAdminClient.mutation(api.scheduler.manualRunSchedule, { workflowId });
    await t.mutation(internal.scheduler.completeSimulation, { executionId, success: false });

    const executions = await superAdminClient.query(api.scheduler.getWorkflowExecutions, {});
    const execution = await superAdminClient.query(api.scheduler.getWorkflowExecution, { executionId });

    expect(executions[0]).toMatchObject({
      _id: executionId,
      workflowName: "Scheduled Workflow",
      startedByName: "Super Admin",
    });
    expect(execution).toMatchObject({
      _id: executionId,
      status: "FAILED",
      workflowName: "Scheduled Workflow",
      startedByName: "Super Admin",
      state: JSON.stringify({ note: "Autonomous backend heartbeat succeeded." }),
      steps: [],
    });

    await expect(superAdminClient.mutation(api.scheduler.deleteSchedule, { scheduleId: agentScheduleId })).resolves.toBe(true);
    expect(await superAdminClient.query(api.scheduler.getSchedule, { scheduleId: agentScheduleId })).toBeNull();
  });
});
