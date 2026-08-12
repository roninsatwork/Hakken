import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * A good answer used to be unkeepable, so the same question got asked again
 * next month. Saving files it as an ordinary company document, which is what
 * makes retrieval pick it up for free — and which is why it inherits the
 * admin gate every other company-knowledge write has.
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

describe("saving an answer", () => {
  test("files it as a company document titled by the question it answers", async () => {
    const { t, adminId, companyId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: adminId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({
      companyId,
      // Titled by what somebody will search for later, not by the answer.
      title: "What are the depot hours on a Friday?",
      textContent: "The depot closes at 4pm on Fridays.",
      format: "text/plain",
    });
  });

  test("records where it came from, so it is not a rumour", async () => {
    const { t, adminId, answerId, threadId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: adminId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(doc?.sourceUrl).toBe(`/app/assistant/${threadId}#${answerId}`);
  });

  test("saving the same answer twice keeps one copy", async () => {
    const { t, adminId, answerId } = await seedAnswer();
    const asAdmin = t.withIdentity({ subject: adminId });

    const first = await asAdmin.mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });
    const second = await asAdmin.mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    expect(second).toBe(first);
    const docs = await t.run(async (ctx) => ctx.db.query("knowledgeDocuments").collect());
    expect(docs).toHaveLength(1);
  });

  test("an admin from another workspace cannot save into this one", async () => {
    const { t, otherAdminId, answerId } = await seedAnswer();

    await expect(
      t.withIdentity({ subject: otherAdminId }).mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId }),
    ).rejects.toThrow();
  });

  test("an admin's save is approved on the spot", async () => {
    const { t, adminId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: adminId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ reviewStatus: "APPROVED", status: "processing" });
  });

  test("a question cannot be saved as though it were an answer", async () => {
    const { t, adminId, threadId } = await seedAnswer();
    const questionId = await t.run(async (ctx) =>
      (await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect())
        .find((row) => row.role === "user")!._id,
    );

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.knowledge.saveAnswerToKnowledge, { messageId: questionId }),
    ).rejects.toThrow("Only an answer can be saved");
  });

  test("a team member may save, and it is held rather than published", async () => {
    const { t, memberId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ reviewStatus: "PENDING", submittedBy: memberId });
    // Never queued, so it is never chunked — retrieval cannot reach it at
    // all, rather than reaching it and being filtered.
    expect(doc?.lastQueuedAt).toBeUndefined();
    expect(doc?.status).toBe("pending");
  });

  test("a held answer has no chunks, so retrieval cannot see it", async () => {
    const { t, memberId, answerId } = await seedAnswer();

    await t.withIdentity({ subject: memberId }).mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const chunks = await t.run(async (ctx) => ctx.db.query("knowledgeChunks").collect());
    expect(chunks).toHaveLength(0);
  });

  test("an admin sees what is waiting and approving starts its ingestion", async () => {
    const { t, memberId, adminId, companyId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const asAdmin = t.withIdentity({ subject: adminId });
    const waiting = await asAdmin.query(api.knowledge.listPendingKnowledge, { companyId });
    expect(waiting.map((row) => row._id)).toEqual([documentId]);

    await asAdmin.mutation(api.knowledge.approveKnowledgeDocument, { documentId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ reviewStatus: "APPROVED", reviewedBy: adminId, status: "processing" });
    expect(doc?.lastQueuedAt).toEqual(expect.any(Number));
  });

  test("rejecting keeps the record and never ingests it", async () => {
    const { t, memberId, adminId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    await t
      .withIdentity({ subject: adminId })
      .mutation(api.knowledge.rejectKnowledgeDocument, { documentId, reason: "Out of date." });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    // What a workspace decided not to trust is part of its record.
    expect(doc).toMatchObject({ reviewStatus: "REJECTED", rejectionReason: "Out of date." });
    expect(doc?.lastQueuedAt).toBeUndefined();
  });

  test("a decision cannot be made twice", async () => {
    const { t, memberId, adminId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const asAdmin = t.withIdentity({ subject: adminId });
    await asAdmin.mutation(api.knowledge.approveKnowledgeDocument, { documentId });

    await expect(
      asAdmin.mutation(api.knowledge.rejectKnowledgeDocument, { documentId }),
    ).rejects.toThrow("already been decided");
  });

  test("an admin from another workspace cannot approve into this one", async () => {
    const { t, memberId, otherAdminId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    await expect(
      t.withIdentity({ subject: otherAdminId }).mutation(api.knowledge.approveKnowledgeDocument, { documentId }),
    ).rejects.toThrow();
  });
});
