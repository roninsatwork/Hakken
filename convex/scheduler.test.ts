import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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
});
