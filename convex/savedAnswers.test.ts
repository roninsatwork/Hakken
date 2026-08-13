import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

  test("a team member may save, and it goes live immediately", async () => {
    const { t, memberId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const doc = await t.run(async (ctx) => ctx.db.get(documentId));
    // Trusted by default: queued for ingestion there and then, and it still
    // records who put it there.
    expect(doc).toMatchObject({ reviewStatus: "APPROVED", submittedBy: memberId, status: "processing" });
    expect(doc?.lastQueuedAt).toEqual(expect.any(Number));
  });

  test("an admin sees every saved answer and who saved it", async () => {
    const { t, memberId, adminId, companyId, answerId } = await seedAnswer();

    await t.withIdentity({ subject: memberId }).mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    const saved = await t
      .withIdentity({ subject: adminId })
      .query(api.knowledge.listSavedAnswers, {
        companyId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(saved.page).toHaveLength(1);
    expect(saved.page[0]).toMatchObject({
      title: "What are the depot hours on a Friday?",
      savedByName: "member@test.com",
    });
  });

  test("a super admin can take one out, and its chunks go with it", async () => {
    const { t, memberId, answerId } = await seedAnswer();
    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "root@test.com", role: "SUPER_ADMIN", createdAt: Date.now() }),
    );

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    // A chunk it would have been given by ingestion.
    await t.run(async (ctx) =>
      ctx.db.insert("knowledgeChunks", {
        documentId,
        isGlobal: false,
        text: "The depot closes at 4pm on Fridays.",
        embedding: [],
      }),
    );

    await t.withIdentity({ subject: superAdminId }).mutation(api.knowledge.deleteDocument, { documentId });
    expect(await t.run(async (ctx) => ctx.db.get(documentId))).toBeNull();

    // Chunks are purged in their own transaction, scheduled by the delete.
    // Run it here so the claim "removal removes it from retrieval" is proven
    // rather than assumed.
    await t.mutation(internal.knowledge.purgeDocumentChunksInternal, { documentId });
    expect(await t.run(async (ctx) => ctx.db.query("knowledgeChunks").collect())).toHaveLength(0);
  });

  test("an admin from another workspace cannot take one out", async () => {
    const { t, memberId, otherAdminId, answerId } = await seedAnswer();

    const documentId = await t
      .withIdentity({ subject: memberId })
      .mutation(api.knowledge.saveAnswerToKnowledge, { messageId: answerId });

    await expect(
      t.withIdentity({ subject: otherAdminId }).mutation(api.knowledge.deleteDocument, { documentId }),
    ).rejects.toThrow();
  });
});
