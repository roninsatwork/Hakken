import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Company Memories", () => {
  test("creates, lists, edits, and archives tenant-scoped company memories", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, companyBId } = await t.run(async (ctx) => {
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

      return { adminAId, adminBId, companyAId, companyBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const memoryAId = await adminAClient.mutation(api.companyMemories.createMemory, {
      companyId: companyAId,
      title: "Weekly summary tone",
      content: "Facilities weekly summaries should be concise and list open blockers first.",
      category: "PREFERENCE",
      confidence: 0.9,
    });

    await adminBClient.mutation(api.companyMemories.createMemory, {
      companyId: companyBId,
      title: "Finance variance",
      content: "Finance updates should include quarterly variance before commentary.",
      category: "FACT",
    });

    const adminAPage = await adminAClient.query(api.companyMemories.getForCompany, {
      companyId: companyAId,
      status: "APPROVED",
      paginationOpts,
    });
    expect(adminAPage.page.map((memory) => memory._id)).toEqual([memoryAId]);

    await expect(
      adminBClient.query(api.companyMemories.getForCompany, {
        companyId: companyAId,
        paginationOpts,
      })
    ).rejects.toThrow("Unauthorized");

    await adminAClient.mutation(api.companyMemories.updateMemory, {
      memoryId: memoryAId,
      title: "Facilities summary tone",
      content: "Facilities weekly summaries should be concise, include owners, and list open blockers first.",
      category: "PREFERENCE",
      confidence: 0.85,
    });
    await adminAClient.mutation(api.companyMemories.archiveMemory, { memoryId: memoryAId });

    const state = await t.run(async (ctx) => ({
      memory: await ctx.db.get(memoryAId),
      auditLogs: await ctx.db
        .query("auditLogs")
        .withIndex("by_company", (q) => q.eq("companyId", companyAId))
        .order("asc")
        .collect(),
    }));

    expect(state.memory).toMatchObject({
      title: "Facilities summary tone",
      status: "ARCHIVED",
      archivedBy: adminAId,
      archivedAt: expect.any(Number),
      usageCount: 0,
    });
    expect(state.auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_COMPANY_MEMORY",
      "UPDATE_COMPANY_MEMORY",
      "ARCHIVE_COMPANY_MEMORY",
    ]);
  });

  test("reviews memory candidates and blocks resubmitting rejected fingerprints", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId } = await t.run(async (ctx) => {
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

      return { adminAId, adminBId, companyAId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const candidateId = await adminAClient.mutation(api.companyMemories.createCandidate, {
      companyId: companyAId,
      title: "Public boundary",
      content: "Public widget answers should avoid quoting private customer names.",
      category: "BOUNDARY",
      sourceType: "CHAT",
      reason: "Repeated support chat pattern.",
      confidence: 0.72,
    });

    await expect(adminBClient.mutation(api.companyMemories.approveCandidate, { candidateId })).rejects.toThrow(
      "Unauthorized"
    );

    const memoryId = await adminAClient.mutation(api.companyMemories.approveCandidate, { candidateId });
    const approvedCandidate = await t.run(async (ctx) => ctx.db.get(candidateId));
    const approvedMemory = await t.run(async (ctx) => ctx.db.get(memoryId));

    expect(approvedCandidate).toMatchObject({
      status: "APPROVED",
      reviewedBy: adminAId,
      appliedMemoryId: memoryId,
    });
    expect(approvedMemory).toMatchObject({
      title: "Public boundary",
      category: "BOUNDARY",
      sourceType: "CHAT",
      approvedBy: adminAId,
    });

    const rejectedCandidateId = await adminAClient.mutation(api.companyMemories.createCandidate, {
      companyId: companyAId,
      content: "Always describe pricing as negotiable even when a plan is fixed.",
      category: "SALES",
      reason: "Weak suggestion from a draft transcript.",
    });
    await adminAClient.mutation(api.companyMemories.rejectCandidate, {
      candidateId: rejectedCandidateId,
      rejectionReason: "This contradicts approved plan copy.",
    });

    await expect(
      adminAClient.mutation(api.companyMemories.createCandidate, {
        companyId: companyAId,
        content: "Always   describe pricing as negotiable even when a plan is fixed.",
        category: "SALES",
      })
    ).rejects.toThrow("previously rejected");

    const summary = await adminAClient.query(api.companyMemories.getSummary, { companyId: companyAId });
    expect(summary).toMatchObject({
      approved: 1,
      archived: 0,
      proposed: 0,
      rejected: 1,
    });
  });

  test("runtime search and usage evidence only use approved same-company memory", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, userAId, threadId, messageId, approvedMemoryId, archivedMemoryId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const userAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const threadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        title: "Memory runtime",
        createdAt: now,
        updatedAt: now,
      });
      const messageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Runtime answer",
        createdAt: now,
      });
      const approvedMemoryId = await ctx.db.insert("companyMemories", {
        companyId: companyAId,
        title: "Facilities summary style",
        content: "Facilities opening updates should include blockers and responsible owners.",
        normalizedContent: "facilities opening updates should include blockers and responsible owners.",
        category: "PREFERENCE",
        status: "APPROVED",
        confidence: 0.9,
        sourceType: "MANUAL",
        createdBy: userAId,
        approvedBy: userAId,
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        usageCount: 0,
      });
      const archivedMemoryId = await ctx.db.insert("companyMemories", {
        companyId: companyAId,
        title: "Archived facilities note",
        content: "Facilities opening updates should use the archived old format.",
        normalizedContent: "facilities opening updates should use the archived old format.",
        category: "PREFERENCE",
        status: "ARCHIVED",
        confidence: 1,
        sourceType: "MANUAL",
        createdBy: userAId,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      });
      await ctx.db.insert("companyMemories", {
        companyId: companyBId,
        title: "Foreign facilities note",
        content: "Facilities opening updates belong to a different company.",
        normalizedContent: "facilities opening updates belong to a different company.",
        category: "FACT",
        status: "APPROVED",
        confidence: 1,
        sourceType: "MANUAL",
        createdBy: userAId,
        approvedBy: userAId,
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        usageCount: 0,
      });

      return { companyAId, companyBId, userAId, threadId, messageId, approvedMemoryId, archivedMemoryId };
    });

    const matches = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId: companyAId,
      queryText: "How should facilities opening updates mention blockers?",
    });

    expect(matches.map((match) => match.memoryId)).toEqual([approvedMemoryId]);
    expect(matches[0]).toMatchObject({
      title: "Facilities summary style",
      category: "PREFERENCE",
    });

    await t.mutation(internal.companyMemories.recordRuntimeUsageInternal, {
      companyId: companyAId,
      threadId,
      messageId,
      queryText: "How should facilities opening updates mention blockers?",
      memories: [
        { memoryId: approvedMemoryId, score: matches[0].score },
        { memoryId: archivedMemoryId, score: 99 },
      ],
    });

    const state = await t.run(async (ctx) => ({
      approvedMemory: await ctx.db.get(approvedMemoryId),
      archivedMemory: await ctx.db.get(archivedMemoryId),
      usageRows: await ctx.db
        .query("companyMemoryUsage")
        .withIndex("by_thread_used", (q) => q.eq("threadId", threadId))
        .collect(),
    }));

    expect(state.approvedMemory).toMatchObject({
      usageCount: 1,
      lastUsedAt: expect.any(Number),
    });
    expect(state.archivedMemory).toMatchObject({
      usageCount: 0,
    });
    expect(state.archivedMemory).not.toHaveProperty("lastUsedAt");
    expect(state.usageRows).toHaveLength(1);
    expect(state.usageRows[0]).toMatchObject({
      memoryId: approvedMemoryId,
      companyId: companyAId,
      threadId,
      messageId,
    });
    expect(companyBId).not.toBe(companyAId);
    expect(userAId).toBeTruthy();
  });
});
