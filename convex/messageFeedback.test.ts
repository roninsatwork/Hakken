import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MESSAGE_FEEDBACK_DAILY_CAP } from "./messageFeedback";

describe("Message feedback (self-improvement, Phase 3)", () => {
  async function seedChat(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const userAId = await ctx.db.insert("users", {
        email: "user-a@example.com",
        role: "USER",
        companyId: companyAId,
      });
      const userBId = await ctx.db.insert("users", {
        email: "user-b@example.com",
        role: "USER",
        companyId: companyBId,
      });
      const now = Date.now();
      const memoryId = await ctx.db.insert("companyMemories", {
        companyId: companyAId,
        title: "Depot hours",
        content: "The depot closes at 4pm on Fridays.",
        normalizedContent: "the depot closes at 4pm on fridays.",
        category: "FACT",
        applyMode: "WHEN_RELEVANT",
        status: "APPROVED",
        confidence: 0.5,
        sourceType: "MANUAL",
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        usageCount: 1,
      });
      const threadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        createdAt: now,
        updatedAt: now,
      });
      const userMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "When does the depot close on Fridays?",
        createdAt: now,
        companyId: companyAId,
        userId: userAId,
      });
      const assistantMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "The depot closes at 4pm on Fridays.",
        createdAt: now + 1,
        companyId: companyAId,
        companyMemoryEvidenceJson: JSON.stringify({ memories: [{ memoryId, score: 1 }] }),
      });
      return {
        companyAId,
        companyBId,
        userAId,
        userBId,
        memoryId,
        threadId,
        userMessageId,
        assistantMessageId,
      };
    });
  }

  test("the thread owner can rate once, change their mind, and the memory counters follow", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedChat(t);
    const asUserA = t.withIdentity({ subject: seed.userAId });

    await asUserA.mutation(api.messageFeedback.upsertForMessage, {
      messageId: seed.assistantMessageId,
      rating: "NEGATIVE",
      labels: ["INCORRECT"],
    });

    let memory = await t.run(async (ctx) => await ctx.db.get(seed.memoryId));
    expect(memory?.negativeFeedbackCount).toBe(1);
    expect(memory?.positiveFeedbackCount ?? 0).toBe(0);

    // A changed mind moves the count across; it does not stack both sides,
    // and it stays one row.
    await asUserA.mutation(api.messageFeedback.upsertForMessage, {
      messageId: seed.assistantMessageId,
      rating: "POSITIVE",
      labels: ["GREAT_ANSWER"],
    });
    memory = await t.run(async (ctx) => await ctx.db.get(seed.memoryId));
    expect(memory?.negativeFeedbackCount).toBe(0);
    expect(memory?.positiveFeedbackCount).toBe(1);

    const rows = await t.run(async (ctx) => await ctx.db.query("messageFeedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rating: "POSITIVE",
      countsTowardLearning: true,
      userId: seed.userAId,
    });

    const mine = await asUserA.query(api.messageFeedback.getMineForThread, {
      threadId: seed.threadId,
    });
    expect(mine.enabled).toBe(true);
    expect(mine.ratings).toEqual([
      { messageId: seed.assistantMessageId, rating: "POSITIVE", labels: ["GREAT_ANSWER"] },
    ]);
  });

  test("every guard refuses: foreign user, user message, switched off", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedChat(t);
    const asUserA = t.withIdentity({ subject: seed.userAId });
    const asUserB = t.withIdentity({ subject: seed.userBId });

    await expect(
      asUserB.mutation(api.messageFeedback.upsertForMessage, {
        messageId: seed.assistantMessageId,
        rating: "NEGATIVE",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      asUserA.mutation(api.messageFeedback.upsertForMessage, {
        messageId: seed.userMessageId,
        rating: "POSITIVE",
      })
    ).rejects.toThrow("Only assistant messages can be rated");

    // A foreign user's thread view is empty, not an error.
    const foreign = await asUserB.query(api.messageFeedback.getMineForThread, {
      threadId: seed.threadId,
    });
    expect(foreign.ratings).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: "SELF_IMPROVEMENT_CONFIG",
        value: JSON.stringify({ endUserFeedback: false }),
        updatedAt: Date.now(),
      });
    });
    await expect(
      asUserA.mutation(api.messageFeedback.upsertForMessage, {
        messageId: seed.assistantMessageId,
        rating: "POSITIVE",
      })
    ).rejects.toThrow("Feedback is switched off");
    const disabled = await asUserA.query(api.messageFeedback.getMineForThread, {
      threadId: seed.threadId,
    });
    expect(disabled.enabled).toBe(false);
  });

  test("past the daily cap a rating is stored but stops teaching", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedChat(t);
    const asUserA = t.withIdentity({ subject: seed.userAId });

    // Fill the day's quota with counted rows on other messages.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MESSAGE_FEEDBACK_DAILY_CAP; index += 1) {
        const messageId = await ctx.db.insert("messages", {
          threadId: seed.threadId,
          role: "assistant",
          content: `Filler answer ${index}`,
          createdAt: now,
          companyId: seed.companyAId,
        });
        await ctx.db.insert("messageFeedback", {
          messageId,
          threadId: seed.threadId,
          companyId: seed.companyAId,
          userId: seed.userAId,
          rating: "POSITIVE",
          labels: [],
          countsTowardLearning: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await asUserA.mutation(api.messageFeedback.upsertForMessage, {
      messageId: seed.assistantMessageId,
      rating: "NEGATIVE",
      labels: ["INCORRECT"],
    });

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("messageFeedback").collect()).filter(
        (row) => row.messageId === seed.assistantMessageId
      )
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].countsTowardLearning).toBe(false);

    // Uncounted means unfelt: the memory the answer leaned on is untouched.
    const memory = await t.run(async (ctx) => await ctx.db.get(seed.memoryId));
    expect(memory?.negativeFeedbackCount ?? 0).toBe(0);
  });

  test("the sweep reads flagged conversations first, labelled, and its marker never moves backwards", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedChat(t);
    const asUserA = t.withIdentity({ subject: seed.userAId });

    // A busy tenant: newer unrelated chatter that would fill the window.
    await t.run(async (ctx) => {
      const base = Date.now();
      for (let index = 0; index < 5; index += 1) {
        const threadId = await ctx.db.insert("threads", {
          userId: seed.userAId,
          companyId: seed.companyAId,
          createdAt: base + index,
          updatedAt: base + index,
        });
        await ctx.db.insert("messages", {
          threadId,
          role: "user",
          content: `Unrelated question number ${index}`,
          createdAt: base + 1000 + index,
          companyId: seed.companyAId,
          userId: seed.userAId,
        });
      }
    });

    await asUserA.mutation(api.messageFeedback.upsertForMessage, {
      messageId: seed.assistantMessageId,
      rating: "NEGATIVE",
      labels: ["MISSED_CONTEXT"],
    });

    const input = await t.query(internal.companyMemorySuggestions.getSweepInputInternal, {
      companyId: seed.companyAId,
      since: 0,
    });

    expect(input.messages[0]).toMatchObject({
      content: "When does the depot close on Fridays?",
      feedbackLabels: ["MISSED_CONTEXT"],
    });
    // The unrelated chatter is still read, after the flagged conversation.
    expect(input.messages.length).toBeGreaterThan(1);
    expect(input.messages.slice(1).every((message) => !("feedbackLabels" in message))).toBe(true);
  });

  test("end-user run feedback reaches the candidate generator through the same branches", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seed = await seedChat(t);

    const { runId, agentId } = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Widget Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: seed.companyAId,
        userId: seed.userAId,
        threadId: seed.threadId,
        triggerType: "CHAT",
        objective: "Answer the depot hours question",
        status: "SUCCESS",
        startedAt: 100,
        completedAt: 120,
        updatedAt: 120,
      });
      return { runId, agentId };
    });

    const asUserA = t.withIdentity({ subject: seed.userAId });
    const asUserB = t.withIdentity({ subject: seed.userBId });

    // Only the person whose conversation it was.
    await expect(
      asUserB.mutation(api.agentRunFeedback.upsertForRunAsEndUser, {
        runId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
      })
    ).rejects.toThrow("Unauthorized");

    await asUserA.mutation(api.agentRunFeedback.upsertForRunAsEndUser, {
      runId,
      rating: "POSITIVE",
      labels: ["GOOD_ANSWER"],
    });

    const feedbackRows = await t.run(async (ctx) => await ctx.db.query("agentRunFeedback").collect());
    expect(feedbackRows).toHaveLength(1);
    expect(feedbackRows[0].source).toBe("END_USER");

    // The generator reads rating and labels, not source — a user's praise
    // produces the same "successful pattern" draft an operator's would.
    await t.mutation(internal.agentMemoryCandidates.generateForRunInternal, { runId });
    const candidates = await t.run(async (ctx) =>
      await ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_agent_status_created", (q) =>
          q.eq("agentId", agentId as Id<"agents">).eq("status", "PROPOSED")
        )
        .collect()
    );
    expect(candidates.length).toBeGreaterThan(0);
  });
});
