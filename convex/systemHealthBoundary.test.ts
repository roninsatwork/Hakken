import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("company health boundary", () => {
  test("a newer A run cannot make B's scheduled failure appear in A's health", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { adminA, foreignExecutionId, ownExecutionId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyA = await ctx.db.insert("companies", { name: "Dummy A", createdAt: now });
      const companyB = await ctx.db.insert("companies", { name: "Dummy B", createdAt: now });
      const adminA = await ctx.db.insert("users", { email: "admin-a@test.invalid", role: "ADMIN", companyId: companyA });
      const userB = await ctx.db.insert("users", { email: "user-b@test.invalid", role: "USER", companyId: companyB });
      const agentId = await ctx.db.insert("agents", {
        name: "Shared dummy agent", modelId: "dummy", thinkingMode: false, isActive: true,
        createdAt: now, updatedAt: now,
      });
      const foreignRunId = await ctx.db.insert("agentRuns", {
        agentId, companyId: companyB, userId: userB, triggerType: "SCHEDULE",
        objective: "B work", status: "FAILED", startedAt: now - 3_000, updatedAt: now - 2_000,
      });
      const foreignExecutionId = await ctx.db.insert("workflowExecutions", {
        agentId, agentRunId: foreignRunId, companyId: companyB, startedBy: userB,
        triggerType: "SCHEDULE", status: "FAILED", startedAt: now - 3_000,
        completedAt: now - 2_000, state: "B_MARKER_DUMMY",
      });
      const ownRunId = await ctx.db.insert("agentRuns", {
        agentId, companyId: companyA, userId: adminA, triggerType: "CHAT",
        objective: "A work", status: "SUCCESS", startedAt: now - 1_000, updatedAt: now - 900,
      });
      const ownExecutionId = await ctx.db.insert("workflowExecutions", {
        agentId, agentRunId: ownRunId, companyId: companyA, startedBy: adminA,
        triggerType: "SCHEDULE", status: "FAILED", startedAt: now - 1_000,
        completedAt: now - 900, state: "A_MARKER_DUMMY",
      });
      return { adminA, foreignExecutionId, ownExecutionId };
    });
    const health = await t.withIdentity({ subject: adminA }).query(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 });
    const ids = health.operations.failedScheduledExecutions.examples.map((entry) => entry.id);
    expect(ids).toContain(ownExecutionId);
    expect(ids).not.toContain(foreignExecutionId);
  });

  test("a shared agent's newest A run does not reveal platform or B schedules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { adminA, ownScheduleId, foreignScheduleId, platformScheduleId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyA = await ctx.db.insert("companies", { name: "Dummy A", createdAt: now });
      const companyB = await ctx.db.insert("companies", { name: "Dummy B", createdAt: now });
      const adminA = await ctx.db.insert("users", { email: "schedule-a@test.invalid", role: "ADMIN", companyId: companyA });
      const adminB = await ctx.db.insert("users", { email: "schedule-b@test.invalid", role: "ADMIN", companyId: companyB });
      const operator = await ctx.db.insert("users", { email: "schedule-operator@test.invalid", role: "SUPER_ADMIN" });
      const agentId = await ctx.db.insert("agents", {
        name: "Shared schedule agent", modelId: "dummy", thinkingMode: false, isActive: true,
        createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("agentRuns", {
        agentId, companyId: companyA, userId: adminA, triggerType: "CHAT",
        objective: "A work", status: "SUCCESS", startedAt: now - 1_000, updatedAt: now - 900,
      });
      const base = { agentId, intervalStr: "daily", isActive: true, createdAt: now - 86_400_000, nextRunAt: now - 3_600_000 };
      const ownScheduleId = await ctx.db.insert("schedules", { ...base, name: "A schedule", createdBy: adminA });
      const foreignScheduleId = await ctx.db.insert("schedules", { ...base, name: "B schedule", createdBy: adminB });
      const platformScheduleId = await ctx.db.insert("schedules", { ...base, name: "Platform schedule", createdBy: operator });
      return { adminA, ownScheduleId, foreignScheduleId, platformScheduleId };
    });
    const health = await t.withIdentity({ subject: adminA }).query(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 });
    const ids = health.operations.overdueSchedules.examples.map((entry) => entry.id);
    expect(ids).toContain(ownScheduleId);
    expect(ids).not.toContain(foreignScheduleId);
    expect(ids).not.toContain(platformScheduleId);
  });
});
