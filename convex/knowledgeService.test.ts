import { describe, expect, test } from "vitest";
import {
  buildKnowledgeChunkRecords,
  buildKnowledgeDocumentRecord,
  getKnowledgeAuditMetadata,
  getKnowledgeAuditScope,
  getKnowledgeScopeFields,
  getThreadVectorExpirationThreshold,
  isExpiredThreadKnowledgeDocument,
  isWebsiteDocumentUnderRootDomain,
} from "./knowledgeService";
import type { Doc, Id } from "./_generated/dataModel";

describe("knowledge service helpers", () => {
  test("builds sparse knowledge scope fields", () => {
    const companyId = "company-1" as Id<"companies">;
    const agentId = "agent-1" as Id<"agents">;

    expect(getKnowledgeScopeFields({ companyId, agentId })).toEqual({ companyId, agentId });
    expect(getKnowledgeScopeFields({})).toEqual({});
  });

  test("labels audit scope by most specific document scope", () => {
    expect(getKnowledgeAuditScope({ threadId: "thread-1" as Id<"threads"> })).toBe("thread");
    expect(getKnowledgeAuditScope({ companyId: "company-1" as Id<"companies"> })).toBe("company");
    expect(getKnowledgeAuditScope({ agentId: "agent-1" as Id<"agents"> })).toBe("agent");
    expect(getKnowledgeAuditScope({})).toBe("global");
  });

  test("detects expired thread-scoped documents only", () => {
    const baseDoc = {
      _id: "doc-1" as Id<"knowledgeDocuments">,
      _creationTime: 0,
      title: "Doc",
      status: "ready",
      format: "text/plain",
      createdBy: "user-1" as Id<"users">,
      createdAt: 100,
    } satisfies Doc<"knowledgeDocuments">;

    expect(isExpiredThreadKnowledgeDocument({ ...baseDoc, threadId: "thread-1" as Id<"threads"> }, 200)).toBe(true);
    expect(isExpiredThreadKnowledgeDocument({ ...baseDoc, threadId: "thread-1" as Id<"threads"> }, 50)).toBe(false);
    expect(isExpiredThreadKnowledgeDocument(baseDoc, 200)).toBe(false);
  });

  test("builds knowledge document records with sparse storage and scope fields", () => {
    const companyId = "company-1" as Id<"companies">;
    const creatorId = "user-1" as Id<"users">;
    const storageId = "storage-1" as Id<"_storage">;

    expect(
      buildKnowledgeDocumentRecord({
        title: "Handbook",
        fileId: storageId,
        textContent: "",
        companyId,
        status: "processing",
        format: "application/pdf",
        createdBy: creatorId,
        createdAt: 123,
      })
    ).toEqual({
      title: "Handbook",
      fileId: storageId,
      textContent: "",
      companyId,
      status: "processing",
      format: "application/pdf",
      createdBy: creatorId,
      createdAt: 123,
    });
  });

  test("serializes audit metadata with optional scope", () => {
    expect(
      getKnowledgeAuditMetadata({
        title: "Handbook",
        format: "text/plain",
        scope: { companyId: "company-1" as Id<"companies"> },
      })
    ).toBe(JSON.stringify({ title: "Handbook", format: "text/plain", scope: "company" }));

    expect(getKnowledgeAuditMetadata({ title: "Handbook", format: "text/plain" })).toBe(
      JSON.stringify({ title: "Handbook", format: "text/plain" })
    );
  });

  test("builds scoped and global chunk records", () => {
    const documentId = "doc-1" as Id<"knowledgeDocuments">;
    const companyId = "company-1" as Id<"companies">;

    expect(
      buildKnowledgeChunkRecords({
        documentId,
        scope: { companyId },
        chunks: [{ text: "alpha", embedding: [0.1, 0.2] }],
      })
    ).toEqual([
      {
        documentId,
        companyId,
        isGlobal: false,
        text: "alpha",
        embedding: [0.1, 0.2],
      },
    ]);

    expect(
      buildKnowledgeChunkRecords({
        documentId,
        scope: {},
        chunks: [{ text: "global", embedding: [0.3] }],
      })
    ).toEqual([
      {
        documentId,
        isGlobal: true,
        text: "global",
        embedding: [0.3],
      },
    ]);
  });

  test("calculates thread vector expiration threshold", () => {
    expect(getThreadVectorExpirationThreshold(Date.parse("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-05-31T12:00:00.000Z")
    );
  });

  test("matches website documents under root domain", () => {
    const doc = {
      _id: "doc-1" as Id<"knowledgeDocuments">,
      _creationTime: 0,
      title: "URL",
      sourceUrl: "https://example.com/docs/page",
      status: "ready",
      format: "url",
      createdBy: "user-1" as Id<"users">,
      createdAt: 100,
    } satisfies Doc<"knowledgeDocuments">;

    expect(isWebsiteDocumentUnderRootDomain(doc, "https://example.com")).toBe(true);
    expect(isWebsiteDocumentUnderRootDomain(doc, "https://other.example")).toBe(false);
    expect(isWebsiteDocumentUnderRootDomain({ ...doc, format: "text/plain" }, "https://example.com")).toBe(false);
  });
});
