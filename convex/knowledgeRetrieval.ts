/**
 * The one retrieval spine, shared by every prompt-building action.
 *
 * Four sites (assistant chat, agent runtime, swarm, sales reports) each grew
 * their own copy of the same sequence — resolve the embedding model, embed the
 * query, vector-search `knowledgeChunks`, load and budget the winners. Four
 * copies meant a retrieval improvement landed wherever someone remembered to
 * paste it; the swarm's copy had also drifted into searching with no filter
 * when it lacked a company, which would read every tenant's chunks.
 *
 * This module is that spine, once. Sites keep what is genuinely theirs — which
 * scopes to search, how to budget, how to wrap the result — and share what is
 * not: embedding, the vector+keyword hybrid search, and the fusion of the two
 * rankings (see `knowledgeRetrievalService.ts` for why hybrid).
 *
 * Scoping is closed by construction: a search happens per
 * `KnowledgeRetrievalScope`, and no unscoped variant exists.
 */

import type { GenericActionCtx } from "convex/server";

import type { DataModel, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  fuseRetrievalRankings,
  type FusedMatch,
  type KnowledgeRetrievalScope,
} from "./knowledgeRetrievalService";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import {
  createVertexEmbeddingClient,
  embedVertexContentWithRetry,
} from "./vertexProviderService";

type RetrievalCtx = GenericActionCtx<DataModel>;

/**
 * Embed a retrieval query with the tenant's configured embedding model.
 *
 * Returns null when the model produced nothing usable — callers treat that as
 * "retrieval unavailable" and continue without knowledge, which is the
 * established failure posture at every site (a broken RAG pipeline must not
 * take the reply down with it).
 */
export async function embedRetrievalQuery(
  ctx: RetrievalCtx,
  args: {
    query: string;
    companyId: Id<"companies"> | undefined;
    /** Telemetry label, e.g. "assistantRagEmbedding". */
    operation: string;
  }
): Promise<number[] | null> {
  const embeddingModel = await ctx.runQuery(
    internal.aiModels.resolveEmbeddingModelConfigForExecution,
    { companyId: args.companyId }
  );
  const providerModelId = getGoogleVertexProviderModelId(embeddingModel, args.operation);
  const response = await embedVertexContentWithRetry(
    createVertexEmbeddingClient(),
    { model: providerModelId, contents: args.query },
    { operation: args.operation }
  );

  const vector = response.embeddings?.[0]?.values;
  if (!vector || vector.length !== embeddingModel.embeddingDimensions) return null;
  return vector as number[];
}

function runScopedVectorSearch(
  ctx: RetrievalCtx,
  scope: KnowledgeRetrievalScope,
  vector: number[],
  limit: number
) {
  // One call per scope kind, so each filter lambda keeps its inferred type;
  // the closed scope union has already made an unfiltered search inexpressible.
  switch (scope.kind) {
    case "company":
      return ctx.vectorSearch("knowledgeChunks", "by_embedding", {
        vector,
        limit,
        filter: (q) => q.eq("companyId", scope.companyId as Id<"companies">),
      });
    case "agent":
      return ctx.vectorSearch("knowledgeChunks", "by_embedding", {
        vector,
        limit,
        filter: (q) => q.eq("agentId", scope.agentId as Id<"agents">),
      });
    case "thread":
      return ctx.vectorSearch("knowledgeChunks", "by_embedding", {
        vector,
        limit,
        filter: (q) => q.eq("threadId", scope.threadId as Id<"threads">),
      });
    case "global":
      return ctx.vectorSearch("knowledgeChunks", "by_embedding", {
        vector,
        limit,
        filter: (q) => q.eq("isGlobal", true),
      });
  }
}

function keywordScopeArg(scope: KnowledgeRetrievalScope) {
  switch (scope.kind) {
    case "company":
      return { kind: "company" as const, companyId: scope.companyId as Id<"companies"> };
    case "agent":
      return { kind: "agent" as const, agentId: scope.agentId as Id<"agents"> };
    case "thread":
      return { kind: "thread" as const, threadId: scope.threadId as Id<"threads"> };
    case "global":
      return { kind: "global" as const };
  }
}

/**
 * Hybrid search of one scope: vector and keyword in parallel, rankings fused.
 *
 * The keyword half is best-effort in the same way the whole pipeline is — if
 * the text search fails, the vector ranking stands alone rather than failing
 * the retrieval.
 */
export async function searchKnowledgeScope(
  ctx: RetrievalCtx,
  args: {
    queryVector: number[];
    queryText: string;
    scope: KnowledgeRetrievalScope;
    limit: number;
  }
): Promise<FusedMatch<Id<"knowledgeChunks">>[]> {
  const [vectorRanked, keywordRanked] = await Promise.all([
    runScopedVectorSearch(ctx, args.scope, args.queryVector, args.limit),
    ctx
      .runQuery(internal.knowledge.searchChunksByTextInternal, {
        query: args.queryText,
        limit: args.limit,
        scope: keywordScopeArg(args.scope),
      })
      .catch(() => [] as { _id: Id<"knowledgeChunks"> }[]),
  ]);

  return fuseRetrievalRankings({ vectorRanked, keywordRanked });
}
