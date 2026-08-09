import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MAX_ALWAYS_MEMORIES } from "./utils/memoryApplication";

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
      applyMode: "ALWAYS",
    });

    await adminBClient.mutation(api.companyMemories.createMemory, {
      companyId: companyBId,
      title: "Finance variance",
      content: "Finance updates should include quarterly variance before commentary.",
      applyMode: "WHEN_RELEVANT",
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
      applyMode: "ALWAYS",
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
      applyMode: "ALWAYS",
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
      applyMode: "ALWAYS",
      sourceType: "CHAT",
      approvedBy: adminAId,
    });

    const rejectedCandidateId = await adminAClient.mutation(api.companyMemories.createCandidate, {
      companyId: companyAId,
      content: "Always describe pricing as negotiable even when a plan is fixed.",
      applyMode: "WHEN_RELEVANT",
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
        applyMode: "WHEN_RELEVANT",
      })
    ).rejects.toThrow("turned down");

    const summary = await adminAClient.query(api.companyMemories.getSummary, { companyId: companyAId });
    expect(summary).toMatchObject({
      approved: 1,
      alwaysCount: 1,
      proposed: 0,
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
        applyMode: "WHEN_RELEVANT",
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
        applyMode: "WHEN_RELEVANT",
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
        applyMode: "WHEN_RELEVANT",
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

    expect(matches.relevant.map((match) => match.memoryId)).toEqual([approvedMemoryId]);
    expect(matches.relevant[0]).toMatchObject({
      title: "Facilities summary style",
      applyMode: "WHEN_RELEVANT",
    });

    await t.mutation(internal.companyMemories.recordRuntimeUsageInternal, {
      companyId: companyAId,
      threadId,
      messageId,
      queryText: "How should facilities opening updates mention blockers?",
      memories: [
        { memoryId: approvedMemoryId, score: matches.relevant[0].score },
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

  test("an Always memory reaches the model even when the message shares no words with it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Boundary Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
      return { companyId, adminId };
    });
    const adminClient = t.withIdentity({ subject: adminId });

    await adminClient.mutation(api.companyMemories.createMemory, {
      companyId,
      title: "No delivery dates",
      content: "Never promise a delivery date over chat.",
      applyMode: "ALWAYS",
    });
    await adminClient.mutation(api.companyMemories.createMemory, {
      companyId,
      title: "Returns window",
      content: "Returns are accepted within 30 days of purchase.",
      applyMode: "WHEN_RELEVANT",
    });

    // Nothing here overlaps either memory. Under the old keyword scoring the
    // boundary either dropped out or survived only by accident.
    const unrelated = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "Can someone help me reset my password?",
    });
    expect(unrelated.always.map((memory) => memory.title)).toEqual(["No delivery dates"]);
    expect(unrelated.relevant).toEqual([]);

    // A message with no searchable word at all was previously a dead end that
    // returned nothing, boundaries included.
    const greeting = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "hi",
    });
    expect(greeting.always.map((memory) => memory.title)).toEqual(["No delivery dates"]);

    // And the when-relevant memory does arrive when it is actually relevant.
    const onTopic = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "What is your returns policy?",
    });
    expect(onTopic.relevant.map((memory) => memory.title)).toEqual(["Returns window"]);
  });

  test("the sixth Always memory is refused, and says why", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Capped Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
      return { companyId, adminId };
    });
    const adminClient = t.withIdentity({ subject: adminId });

    for (let index = 0; index < MAX_ALWAYS_MEMORIES; index += 1) {
      await adminClient.mutation(api.companyMemories.createMemory, {
        companyId,
        title: `Always ${index}`,
        content: `Always rule number ${index}.`,
        applyMode: "ALWAYS",
      });
    }

    await expect(
      adminClient.mutation(api.companyMemories.createMemory, {
        companyId,
        title: "One too many",
        content: "This one does not fit.",
        applyMode: "ALWAYS",
      }),
    ).rejects.toThrow(`can have ${MAX_ALWAYS_MEMORIES} memories set to Always`);

    // The cap is on Always only — when-relevant memory is uncapped.
    await expect(
      adminClient.mutation(api.companyMemories.createMemory, {
        companyId,
        title: "Looked up",
        content: "This one is only used when it comes up.",
        applyMode: "WHEN_RELEVANT",
      }),
    ).resolves.toBeDefined();
  });

  test("a removed memory stops applying and can be put back", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Restore Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
      return { companyId, adminId };
    });
    const adminClient = t.withIdentity({ subject: adminId });

    const memoryId = await adminClient.mutation(api.companyMemories.createMemory, {
      companyId,
      title: "Tone",
      content: "Write plainly and never use jargon.",
      applyMode: "ALWAYS",
    });

    await adminClient.mutation(api.companyMemories.archiveMemory, { memoryId });
    const afterRemoval = await t.query(internal.companyMemories.getAlwaysMemoriesInternal, { companyId });
    expect(afterRemoval).toEqual([]);

    // The old message claimed the memory did not exist, which sent the reader
    // looking for the wrong problem.
    await expect(
      adminClient.mutation(api.companyMemories.archiveMemory, { memoryId }),
    ).rejects.toThrow("already been removed");

    await adminClient.mutation(api.companyMemories.restoreMemory, { memoryId });
    const afterRestore = await t.query(internal.companyMemories.getAlwaysMemoriesInternal, { companyId });
    expect(afterRestore.map((memory) => memory.title)).toEqual(["Tone"]);
  });

  test("a memory written before applyMode existed still behaves as its old category said", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Legacy Co", createdAt: now });
      const userId = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
      for (const [title, category] of [["Old tone note", "TONE"], ["Old fact", "FACT"]] as const) {
        await ctx.db.insert("companyMemories", {
          companyId,
          title,
          content: `${title} body.`,
          normalizedContent: `${title.toLowerCase()} body.`,
          category,
          // Deliberately unstamped: this is a row the backfill has not reached.
          status: "APPROVED",
          confidence: 0.8,
          sourceType: "MANUAL",
          createdBy: userId,
          approvedBy: userId,
          createdAt: now,
          updatedAt: now,
          approvedAt: now,
          usageCount: 0,
        });
      }
      return { companyId };
    });

    const always = await t.query(internal.companyMemories.getAlwaysMemoriesInternal, { companyId });
    expect(always.map((memory) => memory.title)).toEqual(["Old tone note"]);

    // The runner schedules its batches, so the batch is invoked directly here
    // rather than depending on the test scheduler draining.
    const { migrationId } = await t.mutation(internal.dataMigrations.run, {
      name: "2026-07-26-company-memory-apply-mode",
    });
    await t.mutation(internal.dataMigrations.processBatch, { migrationId, batchSize: 200 });

    const stamped = await t.run(async (ctx) => await ctx.db
      .query("companyMemories")
      .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
      .collect());
    expect(stamped.map((memory) => [memory.title, memory.applyMode]).sort()).toEqual([
      ["Old fact", "WHEN_RELEVANT"],
      ["Old tone note", "ALWAYS"],
    ]);
  });
});

describe("Outcome-weighted company ranking (self-improvement, Phase 2)", () => {
  test("rated memories reorder within the cap; the flag restores position order", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { companyId, criticisedId, praisedId, neutralId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const base = {
        companyId,
        category: "FACT",
        applyMode: "WHEN_RELEVANT" as const,
        status: "APPROVED" as const,
        confidence: 0.5,
        sourceType: "MANUAL" as const,
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        usageCount: 1,
        lastUsedAt: now,
      };
      // Inserted first, so it wins the text tie and can only be displaced by
      // its ratings.
      const criticisedId = await ctx.db.insert("companyMemories", {
        ...base,
        title: "Criticised delivery note",
        content: "Delivery slots are booked on the portal — criticised",
        normalizedContent: "delivery slots are booked on the portal — criticised",
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 6,
        lastFeedbackAt: now,
      });
      const praisedId = await ctx.db.insert("companyMemories", {
        ...base,
        title: "Praised delivery note",
        content: "Delivery slots are booked on the portal — praised",
        normalizedContent: "delivery slots are booked on the portal — praised",
        positiveFeedbackCount: 6,
        negativeFeedbackCount: 0,
        lastFeedbackAt: now,
      });
      const neutralId = await ctx.db.insert("companyMemories", {
        ...base,
        title: "Unrated delivery note",
        content: "Delivery slots are booked on the portal — unrated",
        normalizedContent: "delivery slots are booked on the portal — unrated",
      });
      return { companyId, criticisedId, praisedId, neutralId };
    });

    const ranked = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "how do I book delivery slots on the portal",
    });
    expect(ranked.relevant.map((match) => match.memoryId)).toEqual([praisedId, criticisedId, neutralId]);

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: "SELF_IMPROVEMENT_CONFIG",
        value: JSON.stringify({ outcomeWeightedRanking: false }),
        updatedAt: now,
      });
    });
    const positional = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "how do I book delivery slots on the portal",
    });
    expect(positional.relevant.map((match) => match.memoryId)).toEqual([criticisedId, praisedId, neutralId]);
  });

  test("ALWAYS memories never reorder on ratings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();
    const { companyId, alwaysId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const alwaysId = await ctx.db.insert("companyMemories", {
        companyId,
        title: "Trading hours",
        content: "The depot closes at 4pm on Fridays.",
        normalizedContent: "the depot closes at 4pm on fridays.",
        category: "INSTRUCTION",
        applyMode: "ALWAYS",
        status: "APPROVED",
        confidence: 0.5,
        sourceType: "MANUAL",
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        usageCount: 1,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 40,
        lastFeedbackAt: now,
      });
      return { companyId, alwaysId };
    });

    const result = await t.query(internal.companyMemories.getRuntimeMemoriesInternal, {
      companyId,
      queryText: "anything at all",
    });
    expect(result.always.map((match) => match.memoryId)).toContain(alwaysId);
  });
});
