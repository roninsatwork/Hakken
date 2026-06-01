import type { Doc, Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";

export type KnowledgeScope = {
  companyId?: Id<"companies">;
  agentId?: Id<"agents">;
  threadId?: Id<"threads">;
};

type KnowledgeDocumentStatus = "pending" | "processing" | "ready" | "failed";

export type KnowledgeDocumentRecordInput = KnowledgeScope & {
  title: string;
  format: string;
  createdBy: Id<"users">;
  createdAt: number;
  status: KnowledgeDocumentStatus;
  fileId?: Id<"_storage">;
  sourceUrl?: string;
  textContent?: string;
};

export type KnowledgeChunkInput = {
  text: string;
  embedding: number[];
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

export function getKnowledgeAuditMetadata(args: { title: string; format: string; scope?: KnowledgeScope }) {
  const metadata: { title: string; format: string; scope?: string } = {
    title: args.title,
    format: args.format,
  };

  if (args.scope) {
    metadata.scope = getKnowledgeAuditScope(args.scope);
  }

  return JSON.stringify(metadata);
}

export function buildKnowledgeDocumentRecord(args: KnowledgeDocumentRecordInput) {
  return {
    title: args.title,
    ...(args.fileId !== undefined ? { fileId: args.fileId } : {}),
    ...(args.sourceUrl !== undefined ? { sourceUrl: args.sourceUrl } : {}),
    ...(args.textContent !== undefined ? { textContent: args.textContent } : {}),
    ...getKnowledgeScopeFields(args),
    status: args.status,
    format: args.format,
    createdBy: args.createdBy,
    createdAt: args.createdAt,
  };
}

export function buildKnowledgeChunkRecords(args: {
  documentId: Id<"knowledgeDocuments">;
  scope: KnowledgeScope;
  chunks: KnowledgeChunkInput[];
}) {
  const isGlobal = !args.scope.companyId && !args.scope.agentId && !args.scope.threadId;

  return args.chunks.map((chunk) => ({
    documentId: args.documentId,
    ...getKnowledgeScopeFields(args.scope),
    isGlobal,
    text: chunk.text,
    embedding: chunk.embedding,
  }));
}

export function canReadThreadKnowledgeDocuments(thread: Doc<"threads">, current: { userId: Id<"users">; user: Doc<"users"> }) {
  if (thread.userId === current.userId) return true;
  if (current.user.role === "SUPER_ADMIN") return true;
  return current.user.role === "ADMIN" && thread.companyId === getActiveCompanyId(current.user);
}

export function getThreadVectorExpirationThreshold(now = Date.now()) {
  return now - 24 * 60 * 60 * 1000;
}

export function isExpiredThreadKnowledgeDocument(doc: Doc<"knowledgeDocuments">, expirationThreshold: number) {
  return doc.threadId !== undefined && doc.createdAt < expirationThreshold;
}

export function isWebsiteDocumentUnderRootDomain(doc: Doc<"knowledgeDocuments">, rootDomain: string) {
  return doc.format === "url" && doc.sourceUrl !== undefined && doc.sourceUrl.startsWith(rootDomain);
}
