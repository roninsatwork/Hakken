import type { Doc, Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";

export type KnowledgeScope = {
  companyId?: Id<"companies">;
  agentId?: Id<"agents">;
  threadId?: Id<"threads">;
};

export function assertCanAccessKnowledgeScope(
  user: Doc<"users">,
  companyId: Id<"companies"> | undefined,
  globalMessage = "Unauthorized access to global knowledge base",
  companyMessage = "Unauthorized"
) {
  if (!companyId) {
    if (user.role !== "SUPER_ADMIN") {
      throw new Error(globalMessage);
    }
    return;
  }

  const activeCompanyId = getActiveCompanyId(user);
  if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || activeCompanyId !== companyId)) {
    throw new Error(companyMessage);
  }
}

export function getKnowledgeScopeFields(scope: KnowledgeScope) {
  return {
    ...(scope.companyId ? { companyId: scope.companyId } : {}),
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
    ...(scope.threadId ? { threadId: scope.threadId } : {}),
  };
}

export function getKnowledgeAuditScope(scope: KnowledgeScope) {
  if (scope.threadId) return "thread";
  if (scope.companyId) return "company";
  if (scope.agentId) return "agent";
  return "global";
}

export function canReadThreadKnowledgeDocuments(thread: Doc<"threads">, current: { userId: Id<"users">; user: Doc<"users"> }) {
  if (thread.userId === current.userId) return true;
  if (current.user.role === "SUPER_ADMIN") return true;
  return current.user.role === "ADMIN" && thread.companyId === getActiveCompanyId(current.user);
}

export function isExpiredThreadKnowledgeDocument(doc: Doc<"knowledgeDocuments">, expirationThreshold: number) {
  return doc.threadId !== undefined && doc.createdAt < expirationThreshold;
}
