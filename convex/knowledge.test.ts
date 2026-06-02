import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Object Level Authorization - Knowledge Base", () => {
  test("Standard USER cannot upload knowledge documents at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const standardId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "standard@test.com",
        role: "USER",
        createdAt: Date.now()
      });
    });

    const standardClient = t.withIdentity({ subject: standardId });

    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Knowledge Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Attempt to generate upload URL
    await expect(
      standardClient.mutation(api.knowledge.generateUploadUrl, {})
    ).rejects.toThrow("Unauthorized");

    // Attempt to save manual text
    await expect(
      standardClient.mutation(api.knowledge.saveManualText, {
        title: "Malicious Injection",
        textContent: "I am injecting knowledge.",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      standardClient.query(api.knowledge.getDocuments, { agentId })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN from Company A cannot view or delete documents from Company B", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Setup companies
    const companyA = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });
    
    const companyB = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
    });

    // Create Admin for A
    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyA,
        createdAt: Date.now()
      });
    });

    // Create Document for B
    const docBId = await t.run(async (ctx) => {
        // Need a user to represent "createdBy"
        const creatorId = await ctx.db.insert("users", {
          email: "creator@test.com", role: "USER", companyId: companyB, createdAt: Date.now()
        });
        return await ctx.db.insert("knowledgeDocuments", {
            title: "Secret Co B Data",
            textContent: "Secret info",
            companyId: companyB,
            status: "ready",
            createdBy: creatorId,
            format: "text/plain",
            createdAt: Date.now()
        });
    });

    const clientA = t.withIdentity({ subject: adminAId });

    // 1. Try to read companyB documents directly bypassing the undefined default
    await expect(
      clientA.query(api.knowledge.getDocuments, { companyId: companyB })
    ).rejects.toThrow("Unauthorized");

    // 2. Try to pass no company id (global knowledge attempt)
    await expect(
        clientA.query(api.knowledge.getDocuments, {})
    ).rejects.toThrow("Unauthorized");

    // 3. Try to maliciously delete the document of company B
    await expect(
        clientA.mutation(api.knowledge.deleteDocument, { documentId: docBId })
    ).rejects.toThrow("Unauthorized");
  });

  test("SSRF Shield blocks internal URL crawling for RAG ingestion", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Inject super admin capable of running global ingestor
    const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
            email: "admin@test.com",
            role: "SUPER_ADMIN",
            createdAt: Date.now()
        });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    // Attempting to scrape the database's own local loopback
    await expect(
        adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["http://localhost:3000/admin"] })
    ).rejects.toThrow("SSRF Prevention");

    // Attempting to scrape an internal network IP
    await expect(
        adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["http://192.168.1.1/router-login"] })
    ).rejects.toThrow("SSRF Prevention");

    // Attempting standard external URL should succeed natively 
    const result = await adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["https://google.com"] });
    expect(result.length).toBeGreaterThan(0);
  });

  test("admins can manage own company manual documents with audit logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });

      return { companyId, adminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });

    const documentId = await adminClient.mutation(api.knowledge.saveManualText, {
      companyId,
      title: "Company Handbook",
      textContent: "Ship carefully.",
    });

    const documents = await adminClient.query(api.knowledge.getDocuments, { companyId });
    const document = await t.run(async (ctx) => ctx.runQuery(internal.knowledge.getDocInternal, { id: documentId }));
    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());

    expect(documents.map((doc) => doc._id)).toEqual([documentId]);
    expect(document).toMatchObject({
      title: "Company Handbook",
      textContent: "Ship carefully.",
      companyId,
      status: "processing",
      format: "text/plain",
      createdBy: adminId,
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      actionType: "UPLOAD_DOCUMENT",
      actorId: adminId,
      entityType: "knowledgeDocuments",
      entityId: documentId,
      metadata: JSON.stringify({ title: "Company Handbook", format: "text/plain", scope: "company" }),
    });

    await expect(adminClient.mutation(api.knowledge.deleteDocument, { documentId })).resolves.toBe(true);

    const deletedDocument = await t.run(async (ctx) => ctx.db.get(documentId));
    const deleteLog = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "DELETE_DOCUMENT"))
        .first()
    );

    expect(deletedDocument).toBeNull();
    expect(deleteLog).toMatchObject({
      actorId: adminId,
      entityId: documentId,
      metadata: JSON.stringify({ title: "Company Handbook", format: "text/plain" }),
    });
  });

  test("super admins can manage global documents while company admins cannot", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId, superAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { companyId, adminId, superAdminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      adminClient.mutation(api.knowledge.saveManualText, {
        title: "Blocked Global Doc",
        textContent: "Admins should not write here.",
      })
    ).rejects.toThrow("Unauthorized access to global knowledge base");

    const globalDocumentId = await superAdminClient.mutation(api.knowledge.saveManualText, {
      title: "Global Playbook",
      textContent: "Applies everywhere.",
    });
    const companyDocumentId = await adminClient.mutation(api.knowledge.saveManualText, {
      companyId,
      title: "Company Playbook",
      textContent: "Company only.",
    });

    const globalDocuments = await superAdminClient.query(api.knowledge.getDocuments, {});
    const companyDocuments = await superAdminClient.query(api.knowledge.getDocuments, { companyId });

    expect(globalDocuments.map((doc) => doc._id)).toEqual([globalDocumentId]);
    expect(companyDocuments.map((doc) => doc._id)).toEqual([companyDocumentId]);
  });

  test("admins can page company knowledge documents through the bounded inventory query", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId, firstDocumentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const firstDocumentId = await ctx.db.insert("knowledgeDocuments", {
        title: "First Handbook",
        textContent: "A",
        companyId,
        status: "ready",
        createdBy: adminId,
        format: "text/plain",
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeDocuments", {
        title: "Second Handbook",
        textContent: "B",
        companyId,
        status: "ready",
        createdBy: adminId,
        format: "text/plain",
        createdAt: Date.now() + 1,
      });

      return { companyId, adminId, firstDocumentId };
    });

    const adminClient = t.withIdentity({ subject: adminId });

    const firstPage = await adminClient.query(api.knowledge.getPaginatedDocuments, {
      companyId,
      paginationOpts: { numItems: 1, cursor: null },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.page[0]._id).not.toBe(firstDocumentId);
  });

  test("agent-scoped reads are company-isolated for admins and complete for super admins", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, superAdminId, agentId, docAId, docBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const creatorBId = await ctx.db.insert("users", {
        email: "creator-b@test.com",
        role: "ADMIN",
        companyId: companyBId,
        createdAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Knowledge Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const docAId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company A Agent Doc",
        textContent: "A",
        companyId: companyAId,
        agentId,
        status: "ready",
        createdBy: adminAId,
        format: "text/plain",
        createdAt: Date.now(),
      });
      const docBId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company B Agent Doc",
        textContent: "B",
        companyId: companyBId,
        agentId,
        status: "ready",
        createdBy: creatorBId,
        format: "text/plain",
        createdAt: Date.now() + 1,
      });

      return { companyAId, companyBId, adminAId, superAdminId, agentId, docAId, docBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminDocuments = await adminAClient.query(api.knowledge.getDocuments, { agentId });
    const superAdminDocuments = await superAdminClient.query(api.knowledge.getDocuments, { agentId });

    expect(adminDocuments.map((doc) => doc._id)).toEqual([docAId]);
    expect(adminDocuments.every((doc) => doc.companyId === companyAId)).toBe(true);
    expect(superAdminDocuments.map((doc) => doc._id)).toEqual([docBId, docAId]);
    expect(superAdminDocuments.map((doc) => doc.companyId).sort()).toEqual([companyAId, companyBId].sort());
  });

  test("thread documents are visible only to owners, company admins, and super admins", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { ownerId, otherUserId, adminId, superAdminId, threadId, documentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const ownerId = await ctx.db.insert("users", {
        email: "owner@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const otherUserId = await ctx.db.insert("users", {
        email: "other@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const threadId = await ctx.db.insert("threads", {
        userId: ownerId,
        companyId,
        title: "Support Thread",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Chat Upload",
        textContent: "Attached context",
        threadId,
        status: "ready",
        createdBy: ownerId,
        format: "text/plain",
        createdAt: Date.now(),
      });

      return { ownerId, otherUserId, adminId, superAdminId, threadId, documentId };
    });

    const ownerClient = t.withIdentity({ subject: ownerId });
    const otherUserClient = t.withIdentity({ subject: otherUserId });
    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect((await ownerClient.query(api.knowledge.getThreadDocuments, { threadId })).map((doc) => doc._id)).toEqual([
      documentId,
    ]);
    expect(await otherUserClient.query(api.knowledge.getThreadDocuments, { threadId })).toEqual([]);
    expect((await adminClient.query(api.knowledge.getThreadDocuments, { threadId })).map((doc) => doc._id)).toEqual([
      documentId,
    ]);
    expect((await superAdminClient.query(api.knowledge.getThreadDocuments, { threadId })).map((doc) => doc._id)).toEqual([
      documentId,
    ]);

    await expect(otherUserClient.mutation(api.knowledge.deleteDocument, { documentId })).rejects.toThrow(
      "Unauthorized to delete this document"
    );
    await expect(ownerClient.mutation(api.knowledge.deleteDocument, { documentId })).resolves.toBe(true);
  });

  test("website queue deduplicates URLs, refreshes existing documents, and exposes pending work internally", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });

      return { companyId, adminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const [documentId] = await adminClient.mutation(api.knowledge.queueWebsiteUrls, {
      companyId,
      urls: ["https://example.com/docs"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(documentId, { status: "ready" });
    });

    await expect(
      adminClient.mutation(api.knowledge.queueWebsiteUrls, {
        companyId,
        urls: ["https://example.com/docs"],
      })
    ).resolves.toEqual([]);

    await expect(
      adminClient.mutation(api.knowledge.queueWebsiteUrls, {
        companyId,
        urls: ["https://example.com/docs"],
        forceRefresh: true,
      })
    ).resolves.toEqual([documentId]);

    const pendingDocument = await t.run(async (ctx) => ctx.runQuery(internal.knowledge.getNextPendingUrlInternal, {}));

    expect(pendingDocument?._id).toBe(documentId);
    expect(pendingDocument).toMatchObject({
      sourceUrl: "https://example.com/docs",
      companyId,
      status: "pending",
      format: "url",
    });
  });

  test("bulk website delete is scoped by company and root domain", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, docAId, docSiblingId, docBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@test.com",
        role: "ADMIN",
        companyId: companyBId,
        createdAt: Date.now(),
      });
      const docAId = await ctx.db.insert("knowledgeDocuments", {
        title: "Docs",
        sourceUrl: "https://example.com/docs",
        companyId: companyAId,
        status: "ready",
        createdBy: adminAId,
        format: "url",
        createdAt: Date.now(),
      });
      const docSiblingId = await ctx.db.insert("knowledgeDocuments", {
        title: "Other Root",
        sourceUrl: "https://other.example.com/docs",
        companyId: companyAId,
        status: "ready",
        createdBy: adminAId,
        format: "url",
        createdAt: Date.now(),
      });
      const docBId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company B Docs",
        sourceUrl: "https://example.com/docs",
        companyId: companyBId,
        status: "ready",
        createdBy: adminBId,
        format: "url",
        createdAt: Date.now(),
      });

      return { companyAId, companyBId, adminAId, docAId, docSiblingId, docBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });

    await expect(
      adminAClient.mutation(api.knowledge.deleteWebsiteBulk, {
        companyId: companyBId,
        rootDomain: "https://example.com",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      adminAClient.mutation(api.knowledge.deleteWebsiteBulk, {
        companyId: companyAId,
        rootDomain: "https://example.com",
      })
    ).resolves.toBe(1);

    const remainingDocs = await t.run(async (ctx) => ctx.db.query("knowledgeDocuments").collect());

    expect(remainingDocs.map((doc) => doc._id).sort()).toEqual([docBId, docSiblingId].sort());
    expect(await t.run(async (ctx) => ctx.db.get(docAId))).toBeNull();
  });

  test("internal chunk writes replace existing chunks and garbage collect expired thread documents", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, readyDocumentId, oldThreadDocumentId, recentThreadDocumentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const oldThreadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "Old Thread",
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      });
      const recentThreadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "Recent Thread",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const readyDocumentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Ready Doc",
        textContent: "Chunk me",
        companyId,
        status: "processing",
        createdBy: userId,
        format: "text/plain",
        createdAt: Date.now(),
      });
      const oldThreadDocumentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Old Thread Doc",
        textContent: "Expired",
        threadId: oldThreadId,
        status: "ready",
        createdBy: userId,
        format: "text/plain",
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      });
      const recentThreadDocumentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Recent Thread Doc",
        textContent: "Fresh",
        threadId: recentThreadId,
        status: "ready",
        createdBy: userId,
        format: "text/plain",
        createdAt: Date.now(),
      });

      return { companyId, readyDocumentId, oldThreadDocumentId, recentThreadDocumentId };
    });

    await t.mutation(internal.knowledge.saveChunksInternal, {
      documentId: readyDocumentId,
      companyId,
      chunks: [
        { text: "alpha", embedding: [0.1, 0.2] },
        { text: "beta", embedding: [0.3, 0.4] },
      ],
      markReady: false,
    });

    await t.mutation(internal.knowledge.saveChunksInternal, {
      documentId: readyDocumentId,
      companyId,
      chunks: [{ text: "gamma", embedding: [0.7, 0.8] }],
      replaceExisting: false,
    });

    const chunksAfterAppend = await t.run(async (ctx) =>
      ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", readyDocumentId))
        .collect()
    );

    expect(chunksAfterAppend.map((chunk) => chunk.text).sort()).toEqual(["alpha", "beta", "gamma"]);

    await t.mutation(internal.knowledge.saveChunksInternal, {
      documentId: readyDocumentId,
      companyId,
      chunks: [{ text: "replacement", embedding: [0.5, 0.6] }],
    });

    const { documentAfterChunks, chunksAfterReplacement } = await t.run(async (ctx) => ({
      documentAfterChunks: await ctx.db.get(readyDocumentId),
      chunksAfterReplacement: await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", readyDocumentId))
        .collect(),
    }));

    expect(documentAfterChunks?.status).toBe("ready");
    expect(chunksAfterReplacement).toHaveLength(1);
    expect(chunksAfterReplacement[0]).toMatchObject({
      documentId: readyDocumentId,
      companyId,
      isGlobal: false,
      text: "replacement",
      embedding: [0.5, 0.6],
    });

    await t.mutation(internal.knowledge.garbageCollectThreadVectors, {});

    const { oldThreadDocument, recentThreadDocument } = await t.run(async (ctx) => ({
      oldThreadDocument: await ctx.db.get(oldThreadDocumentId),
      recentThreadDocument: await ctx.db.get(recentThreadDocumentId),
    }));

    expect(oldThreadDocument).toBeNull();
    expect(recentThreadDocument?._id).toBe(recentThreadDocumentId);
  });
});
