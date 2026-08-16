import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * "Save to wiki" (one-brain-plan.md, phase 3): a person vouching for an
 * answer files it into the wiki through the Filing Clerk's road, with the
 * conversation as the receipt. The mutation's own duties are tested here —
 * the stamp, the walls, the audit row, the scheduled filing; the prose
 * weaving is the model's half and lives behind the same validation as
 * every other rewrite.
 */
async function seedAnswer() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
    const adminId = await ctx.db.insert("users", { email: "admin@test.com", role: "ADMIN", companyId, createdAt: now });
    const memberId = await ctx.db.insert("users", { email: "member@test.com", role: "USER", companyId, createdAt: now });
    const otherAdminId = await ctx.db.insert("users", {
      email: "other@test.com",
      role: "ADMIN",
      companyId: otherCompanyId,
      createdAt: now,
    });

    const threadId = await ctx.db.insert("threads", { userId: adminId, companyId, createdAt: now, updatedAt: now });
    await ctx.db.insert("messages", {
      threadId,
      role: "user",
      content: "What are the depot hours on a Friday?",
      companyId,
      userId: adminId,
      createdAt: now,
    });
    const answerId = await ctx.db.insert("messages", {
      threadId,
      role: "assistant",
      content: "The depot closes at 4pm on Fridays.",
      companyId,
      createdAt: now + 1,
    });

    return { companyId, otherCompanyId, adminId, memberId, otherAdminId, threadId, answerId };
  });

  return { t, ...ids };
}

describe("saving an answer to the wiki", () => {
  test("stamps the message and leaves an audit row naming the conversation", async () => {
    const { t, adminId, companyId, answerId, threadId } = await seedAnswer();

    await t.withIdentity({ subject: adminId }).mutation(api.knowledge.saveAnswerToWiki, { messageId: answerId });

    const message = await t.run(async (ctx) => ctx.db.get(answerId));
    expect(message?.savedToWikiAt).toEqual(expect.any(Number));

    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const row = audit.find((entry) => entry.actionType === "SAVE_ANSWER_TO_WIKI");
    expect(row).toBeTruthy();
    expect(row?.companyId).toBe(companyId);
    expect(JSON.parse(row!.metadata ?? "{}").threadId).toBe(threadId);
  });

  test("saving the same answer twice files nothing twice", async () => {
    const { t, adminId, answerId } = await seedAnswer();
    const asAdmin = t.withIdentity({ subject: adminId });

    await asAdmin.mutation(api.knowledge.saveAnswerToWiki, { messageId: answerId });
    await asAdmin.mutation(api.knowledge.saveAnswerToWiki, { messageId: answerId });

    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audit.filter((entry) => entry.actionType === "SAVE_ANSWER_TO_WIKI")).toHaveLength(1);
  });

  test("an admin from another workspace cannot save into this one", async () => {
    const { t, otherAdminId, answerId } = await seedAnswer();

    await expect(
      t.withIdentity({ subject: otherAdminId }).mutation(api.knowledge.saveAnswerToWiki, { messageId: answerId }),
    ).rejects.toThrow();
    const message = await t.run(async (ctx) => ctx.db.get(answerId));
    expect(message?.savedToWikiAt).toBeUndefined();
  });

  test("a team member may save, and the admins are told", async () => {
    const { t, memberId, adminId, answerId } = await seedAnswer();

    await t.withIdentity({ subject: memberId }).mutation(api.knowledge.saveAnswerToWiki, { messageId: answerId });

    const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    const told = notifications.find((row) => row.userId === adminId);
    expect(told?.title).toBe("An answer was saved to the wiki");
  });

  test("only an assistant's answer can be saved", async () => {
    const { t, adminId, threadId, companyId } = await seedAnswer();
    const questionId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "And Saturdays?",
        companyId,
        userId: adminId,
        createdAt: Date.now(),
      })
    );
    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.knowledge.saveAnswerToWiki, { messageId: questionId }),
    ).rejects.toThrow("Only an answer can be saved.");
  });
});
