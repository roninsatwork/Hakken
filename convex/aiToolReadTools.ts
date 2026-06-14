import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const DEFAULT_KNOWLEDGE_SEARCH_LIMIT = 5;
const MAX_KNOWLEDGE_SEARCH_LIMIT = 10;
const KNOWLEDGE_DOC_SCAN_LIMIT = 50;
const KNOWLEDGE_CHUNK_SCAN_LIMIT = 100;
const KNOWLEDGE_SNIPPET_CHARS = 700;

type KnowledgeMatch = {
  documentId: Id<"knowledgeDocuments">;
  documentTitle: string;
  chunkId: Id<"knowledgeChunks">;
  snippet: string;
  scope: "agent" | "company";
  score: number;
};

function getSearchTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length >= 3)
    .slice(0, 8);
}

function scoreChunk(text: string, terms: string[]) {
  if (terms.length === 0) return 0;
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function buildSnippet(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  const firstHit = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = firstHit === undefined ? 0 : Math.max(0, firstHit - 160);
  const snippet = text.slice(start, start + KNOWLEDGE_SNIPPET_CHARS);
  return `${start > 0 ? "... " : ""}${snippet}${start + KNOWLEDGE_SNIPPET_CHARS < text.length ? " ..." : ""}`;
}

function getLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? DEFAULT_KNOWLEDGE_SEARCH_LIMIT)) return DEFAULT_KNOWLEDGE_SEARCH_LIMIT;
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_KNOWLEDGE_SEARCH_LIMIT), 1), MAX_KNOWLEDGE_SEARCH_LIMIT);
}

async function getChunkMatches(args: {
  docs: Doc<"knowledgeDocuments">[];
  terms: string[];
  scope: "agent" | "company";
  ctx: QueryCtx;
}) {
  const matches: KnowledgeMatch[] = [];

  for (const doc of args.docs) {
    if (doc.status !== "ready") continue;

    const chunks = await args.ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document", (q) => q.eq("documentId", doc._id))
      .take(KNOWLEDGE_CHUNK_SCAN_LIMIT);

    for (const chunk of chunks) {
      const score = scoreChunk(chunk.text, args.terms);
      if (score <= 0) continue;

      matches.push({
        documentId: doc._id,
        documentTitle: doc.title,
        chunkId: chunk._id,
        snippet: buildSnippet(chunk.text, args.terms),
        scope: args.scope,
        score,
      });
    }
  }

  return matches;
}

export const searchKnowledge = internalQuery({
  args: {
    query: v.string(),
    agentId: v.optional(v.id("agents")),
    companyId: v.optional(v.id("companies")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const terms = getSearchTerms(args.query);
    const limit = getLimit(args.limit);
    if (terms.length === 0) {
      return {
        matches: [],
        query: args.query,
      };
    }

    const agentDocs = args.agentId
      ? args.companyId
        ? await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId!).eq("companyId", args.companyId))
            .order("desc")
            .take(KNOWLEDGE_DOC_SCAN_LIMIT)
        : await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId!))
            .order("desc")
            .take(KNOWLEDGE_DOC_SCAN_LIMIT)
      : [];

    const companyDocs = args.companyId
      ? await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
          .filter((q) => q.and(q.eq(q.field("agentId"), undefined), q.eq(q.field("threadId"), undefined)))
          .order("desc")
          .take(KNOWLEDGE_DOC_SCAN_LIMIT)
      : [];

    const matches = [
      ...(await getChunkMatches({ ctx, docs: agentDocs, terms, scope: "agent" })),
      ...(await getChunkMatches({ ctx, docs: companyDocs, terms, scope: "company" })),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      matches,
      query: args.query,
    };
  },
});
