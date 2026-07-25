import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Run Feedback", () => {
  test("admins can upsert feedback for scoped runs and feedback remains tenant-scoped", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, runAId, runBId, agentId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Feedback Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Summarize customer risk",
        status: "SUCCESS",
        startedAt: 100,
        completedAt: 120,
        updatedAt: 120,
      });
      const runBId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "CHAT",
        objective: "Summarize tenant B risk",
        status: "SUCCESS",
        startedAt: 200,
        completedAt: 220,
        updatedAt: 220,
      });

      return { adminAId, adminBId, runAId, runBId, agentId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(
      adminBClient.mutation(api.agentRunFeedback.upsertForRun, {
        runId: runAId,
        rating: "NEGATIVE",
        labels: ["INCORRECT"],
      })
    ).rejects.toThrow("Unauthorized");

    const feedbackId = await adminAClient.mutation(api.agentRunFeedback.upsertForRun, {
      runId: runAId,
      rating: "POSITIVE",
      labels: ["GOOD_ANSWER", "GOOD_ANSWER", "SHOULD_BECOME_EVAL"],
      comment: "  Strong answer and worth preserving as a regression example.  ",
    });
    await adminAClient.mutation(api.agentRunFeedback.upsertForRun, {
      runId: runAId,
      rating: "NEGATIVE",
      labels: ["MISSED_CONTEXT"],
      comment: "Actually missed context after review.",
    });
    await adminBClient.mutation(api.agentRunFeedback.upsertForRun, {
      runId: runBId,
      rating: "NEUTRAL",
      labels: ["TOO_SLOW"],
    });

    const adminAFeedback = await adminAClient.query(api.agentRunFeedback.getForRun, {
      runId: runAId,
      paginationOpts,
    });
    expect(adminAFeedback.page).toHaveLength(1);
    expect(adminAFeedback.page[0]).toMatchObject({
      _id: feedbackId,
      runId: runAId,
      agentId,
      userId: adminAId,
      rating: "NEGATIVE",
      labels: ["MISSED_CONTEXT"],
      comment: "Actually missed context after review.",
    });

    const adminAMine = await adminAClient.query(api.agentRunFeedback.getMineForAgent, { agentId });
    expect(adminAMine.map((entry) => entry._id)).toEqual([feedbackId]);

    const adminBMine = await adminBClient.query(api.agentRunFeedback.getMineForAgent, { agentId });
    expect(adminBMine).toHaveLength(1);
    expect(adminBMine[0]).toMatchObject({ runId: runBId, rating: "NEUTRAL", labels: ["TOO_SLOW"] });

    await expect(adminBClient.query(api.agentRunFeedback.getForRun, { runId: runAId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(t.query(api.agentRunFeedback.getForRun, { runId: runAId, paginationOpts })).rejects.toThrow(
      "Unauthenticated"
    );

    const auditLogs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT_RUN_FEEDBACK",
      "UPDATE_AGENT_RUN_FEEDBACK",
      "CREATE_AGENT_RUN_FEEDBACK",
    ]);
  });
});

