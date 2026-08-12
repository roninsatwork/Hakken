import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Every reply already records what actually reached the model. The panel
 * only reads that record — so the things worth proving are that it shows
 * what was used, says so plainly when nothing was, and never invents a line
 * for something that has since been deleted.
 */
async function seedAnsweredThread(args: { withEvidence: boolean } = { withEvidence: true }) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
    const userId = await ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId, createdAt: now });
    const strangerId = await ctx.db.insert("users", { email: "b@test.com", role: "USER", companyId, createdAt: now });

    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: "Depot opening hours",
      textContent: "The depot closes at 4pm on Fridays.",
      companyId,
      status: "ready",
      format: "text/plain",
      createdAt: now,
    });
    const chunkId = await ctx.db.insert("knowledgeChunks", {
      documentId,
      companyId,
      isGlobal: false,
      text: "The depot closes at 4pm on Fridays.",
      embedding: [],
    });
    const secondChunkId = await ctx.db.insert("knowledgeChunks", {
      documentId,
      companyId,
      isGlobal: false,
      text: "Weekend hours differ.",
      embedding: [],
    });
    const skillId = await ctx.db.insert("companySkills", {
      companyId,
      name: "Depot operations",
      category: "OPERATIONS",
      riskLevel: "LOW",
      instruction: "Answer depot questions from the published hours.",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const threadId = await ctx.db.insert("threads", { userId, companyId, createdAt: now, updatedAt: now });
    const messageId = await ctx.db.insert("messages", {
      threadId,
      role: "assistant",
      content: "The depot closes at 4pm on Fridays.",
      companyId,
      createdAt: now,
      ...(args.withEvidence
        ? {
            companyRuntimeEvidenceJson: JSON.stringify({
              version: 1,
              skillIds: [skillId],
              sourceIds: [chunkId, secondChunkId],
            }),
            companyMemoryEvidenceJson: JSON.stringify({
              version: 1,
              memories: [{ memoryId: "mem_1", title: "Fridays are short days", applyMode: "ALWAYS" }],
            }),
          }
        : {}),
    });

    return { companyId, userId, strangerId, documentId, chunkId, skillId, threadId, messageId };
  });

  return { t, ...ids };
}

describe("why an answer said what it said", () => {
  test("lists the documents, memories and skills that actually reached the model", async () => {
    const { t, userId, messageId } = await seedAnsweredThread();

    const evidence = await t
      .withIdentity({ subject: userId })
      .query(api.messageEvidence.getForMessage, { messageId });

    expect(evidence?.hasAny).toBe(true);
    // Two chunks of one document are one source to a reader.
    expect(evidence?.documents.map((doc) => doc.title)).toEqual(["Depot opening hours"]);
    expect(evidence?.skills.map((skill) => skill.name)).toEqual(["Depot operations"]);
    expect(evidence?.memories).toEqual([
      { id: "mem_1", title: "Fridays are short days", alwaysOn: true },
    ]);
  });

  test("says plainly when an answer used nothing", async () => {
    const { t, userId, messageId } = await seedAnsweredThread({ withEvidence: false });

    const evidence = await t
      .withIdentity({ subject: userId })
      .query(api.messageEvidence.getForMessage, { messageId });

    // "Nothing was retrieved" is a true and useful answer, not an error.
    expect(evidence).toMatchObject({ hasAny: false, documents: [], memories: [], skills: [] });
  });

  test("a document deleted since the answer was given is skipped, not rendered blank", async () => {
    const { t, userId, messageId, documentId } = await seedAnsweredThread();

    await t.run(async (ctx) => ctx.db.delete(documentId));

    const evidence = await t
      .withIdentity({ subject: userId })
      .query(api.messageEvidence.getForMessage, { messageId });

    expect(evidence?.documents).toEqual([]);
    // The rest of the record still stands.
    expect(evidence?.skills).toHaveLength(1);
  });

  test("somebody else's conversation shows nothing", async () => {
    const { t, strangerId, messageId } = await seedAnsweredThread();

    const evidence = await t
      .withIdentity({ subject: strangerId })
      .query(api.messageEvidence.getForMessage, { messageId });

    expect(evidence).toBeNull();
  });

  test("a question has no workings of its own", async () => {
    const { t, userId, threadId, companyId } = await seedAnsweredThread();
    const questionId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "When does the depot close?",
        companyId,
        userId,
        createdAt: Date.now(),
      }),
    );

    const evidence = await t
      .withIdentity({ subject: userId })
      .query(api.messageEvidence.getForMessage, { messageId: questionId });

    expect(evidence).toBeNull();
  });

  test("evidence written by an older build is treated as none rather than crashing", async () => {
    const { t, userId, messageId } = await seedAnsweredThread();

    await t.run(async (ctx) =>
      ctx.db.patch(messageId, { companyRuntimeEvidenceJson: "{not json", companyMemoryEvidenceJson: "{also not" }),
    );

    const evidence = await t
      .withIdentity({ subject: userId })
      .query(api.messageEvidence.getForMessage, { messageId });

    expect(evidence).toMatchObject({ hasAny: false });
  });
});
