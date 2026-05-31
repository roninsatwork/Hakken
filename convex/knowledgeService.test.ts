import { describe, expect, test } from "vitest";
import {
  getKnowledgeAuditScope,
  getKnowledgeScopeFields,
  isExpiredThreadKnowledgeDocument,
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
});
