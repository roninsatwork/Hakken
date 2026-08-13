import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * A watcher is only useful if it stays quiet and costs nothing until asked
 * to run. So: off until switched on, silent when the answer holds, and loud
 * exactly once when it moves.
 */
async function seedWorkspace() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
    const userId = await ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId, createdAt: now });
    const otherUserId = await ctx.db.insert("users", {
      email: "b@test.com",
      role: "ADMIN",
      companyId: otherCompanyId,
      createdAt: now,
    });
    return { companyId, otherCompanyId, userId, otherUserId };
  });

  return { t, ...ids };
}

describe("scheduled questions", () => {
  test("a new question is off until somebody switches it on", async () => {
    const { t, userId } = await seedWorkspace();

    const questionId = await t.withIdentity({ subject: userId }).mutation(api.scheduledQuestions.createQuestion, {
      question: "Which retail groups do we sell to in fewer than three sites?",
      intervalStr: "weekly",
    });

    const question = await t.run(async (ctx) => ctx.db.get(questionId));
    // Every run costs money; one that starts the moment it is typed spends
    // money nobody agreed to.
    expect(question).toMatchObject({ isActive: false });
    expect(question?.nextRunAt).toBeUndefined();
  });

  test("switching it on schedules the first run, switching it off unschedules it", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "How many prospects are still uncontacted?",
      intervalStr: "daily",
    });

    await asUser.mutation(api.scheduledQuestions.setQuestionActive, { questionId, isActive: true });
    // Due immediately the first time, so switching on takes the baseline the
    // next run is compared against rather than making you wait a full cycle.
    const activated = await t.run(async (ctx) => ctx.db.get(questionId));
    expect(activated?.nextRunAt).toBeLessThanOrEqual(Date.now());

    await asUser.mutation(api.scheduledQuestions.setQuestionActive, { questionId, isActive: false });
    // Cleared, so a paused question cannot be picked up by the dispatcher.
    expect((await t.run(async (ctx) => ctx.db.get(questionId)))?.nextRunAt).toBeUndefined();
  });

  test("the first answer is recorded and tells nobody", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "What are the depot hours?",
      intervalStr: "weekly",
    });

    const result = await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "The depot closes at 4pm on Fridays.",
    });

    expect(result.changed).toBe(false);
    const state = await t.run(async (ctx) => ({
      question: await ctx.db.get(questionId),
      notifications: await ctx.db.query("notifications").collect(),
    }));
    expect(state.question?.lastAnswer).toBe("The depot closes at 4pm on Fridays.");
    // Otherwise every question would alert once, for free, on setup.
    expect(state.notifications).toHaveLength(0);
  });

  test("the same answer reworded tells nobody", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "What are the depot hours?",
      intervalStr: "weekly",
    });

    await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "The depot closes at 4pm on Fridays.",
    });
    const second = await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "the depot closes at 4pm on fridays",
    });

    expect(second.changed).toBe(false);
    expect(await t.run(async (ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });

  test("a changed answer tells the owner once and keeps the new answer", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "What are the depot hours?",
      intervalStr: "weekly",
    });

    await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "The depot closes at 4pm on Fridays.",
    });
    const second = await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "The depot now stays open until 8pm every weekday and all through the weekend.",
    });

    expect(second.changed).toBe(true);
    const state = await t.run(async (ctx) => ({
      question: await ctx.db.get(questionId),
      notifications: await ctx.db.query("notifications").collect(),
      tasks: await ctx.db.query("tasks").collect(),
    }));

    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ userId, kind: "SCHEDULED_ANSWER_CHANGED" });
    expect(state.question?.lastChangedAt).toEqual(expect.any(Number));
    // Reports, does not judge: the new answer is kept as the comparison point.
    expect(state.question?.lastAnswer).toContain("8pm");
    // No task unless the owner asked for one.
    expect(state.tasks).toHaveLength(0);
  });

  test("a question set to raise a task raises one when the answer moves", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "What are the depot hours?",
      intervalStr: "weekly",
      raisesTask: true,
    });

    await t.mutation(internal.scheduledQuestions.recordAnswer, { questionId, answer: "Closes at 4pm." });
    await t.mutation(internal.scheduledQuestions.recordAnswer, {
      questionId,
      answer: "Now open until 8pm every weekday and all through the weekend, including bank holidays.",
    });

    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeUserId: userId, createdBySource: "WORKFLOW" });
  });

  test("a failed run keeps the previous answer rather than raising a false alarm", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "What are the depot hours?",
      intervalStr: "weekly",
    });

    await t.mutation(internal.scheduledQuestions.recordAnswer, { questionId, answer: "Closes at 4pm." });
    await t.mutation(internal.scheduledQuestions.recordFailure, { questionId, error: "503 from the provider" });

    const state = await t.run(async (ctx) => ({
      question: await ctx.db.get(questionId),
      notifications: await ctx.db.query("notifications").collect(),
    }));

    // An outage is not evidence that the answer changed.
    expect(state.question?.lastAnswer).toBe("Closes at 4pm.");
    expect(state.question?.lastError).toBe("503 from the provider");
    expect(state.notifications).toHaveLength(0);
  });

  test("only active questions are ever picked up", async () => {
    const { t, userId } = await seedWorkspace();
    const asUser = t.withIdentity({ subject: userId });

    const questionId = await asUser.mutation(api.scheduledQuestions.createQuestion, {
      question: "Anything?",
      intervalStr: "daily",
    });

    const whenOff = await t.query(internal.scheduledQuestions.getDueQuestions, {
      now: Date.now() + 86_400_000,
      limit: 10,
    });
    expect(whenOff).toHaveLength(0);

    await asUser.mutation(api.scheduledQuestions.setQuestionActive, { questionId, isActive: true });
    const whenOn = await t.query(internal.scheduledQuestions.getDueQuestions, {
      now: Date.now() + 2 * 86_400_000,
      limit: 10,
    });
    expect(whenOn.map((row) => row._id)).toEqual([questionId]);
  });

  test("a question belongs to its workspace", async () => {
    const { t, userId, otherUserId } = await seedWorkspace();

    await t.withIdentity({ subject: userId }).mutation(api.scheduledQuestions.createQuestion, {
      question: "Ours only",
      intervalStr: "weekly",
    });

    const theirs = await t.withIdentity({ subject: otherUserId }).query(api.scheduledQuestions.listQuestions, {});
    expect(theirs).toHaveLength(0);
  });

  test("an empty question is refused", async () => {
    const { t, userId } = await seedWorkspace();

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.scheduledQuestions.createQuestion, {
        question: "   ",
        intervalStr: "weekly",
      }),
    ).rejects.toThrow("needs a question");
  });
});
