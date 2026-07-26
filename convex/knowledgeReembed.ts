import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { GOOGLE_VERTEX_EMBEDDING_MODEL_ID } from "./aiModelService";

/**
 * Re-embedding the knowledge base after an embedding model change.
 *
 * Vectors from two different embedding models are not comparable, even at the same
 * dimension count. Leaving stored chunks embedded by the old model while queries are
 * embedded by the new one does not degrade retrieval gracefully — it returns
 * confidently wrong passages, which is worse than returning none. So a model change
 * obliges a full re-embed, and until it finishes the affected chunks must not be
 * matched against.
 *
 * The vector index cannot be filtered on "was embedded by the current model", so
 * staleness is tracked on the row and the reader checks it. The action that does the
 * provider work lives in `knowledgeReembedActions`.
 */

/**
 * One page of chunks, with the stale ones picked out of it.
 *
 * Paginated rather than filtered over the whole table. Reading every chunk to find
 * the stale ones took 16.3MB against Convex's 16.7MB per-execution limit on a
 * knowledge base of only 2,000 chunks — it would have started failing outright on a
 * slightly larger one, and a re-embed that cannot run is a retrieval outage nobody
 * is watching for. There is no index that helps: the vector index cannot be queried
 * by model, and an index on `embeddingModelId` cannot express "anything other than
 * this", so the page is the unit of work.
 */
export const getStaleChunkPageInternal = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("knowledgeChunks")
      .paginate({ cursor: args.cursor, numItems: args.pageSize });
    const stale = page.page.filter((chunk) => chunk.embeddingModelId !== GOOGLE_VERTEX_EMBEDDING_MODEL_ID);

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      batch: stale.map((chunk) => ({
        chunkId: chunk._id,
        text: chunk.text,
      })),
    };
  },
});

/**
 * How much is left to re-embed, counted from the superseded model's side.
 *
 * Counting the *done* side does not work: a chunk row carries its 768-float vector,
 * so collecting 2,000 of them reads past Convex's 16.7MB per-execution limit however
 * selective the index is — there is no projection, and an index narrows which rows
 * are read, not how much of each. Counting the side that shrinks means the read gets
 * cheaper as the job progresses, and reaching zero is the finish line.
 *
 * Capped, and it says when the cap bit, so a partial count is never mistaken for a
 * total.
 */
export const getRemainingOnModelInternal = internalQuery({
  args: {
    modelId: v.optional(v.string()),
    cap: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(args.cap ?? 400, 400);
    const remaining = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_embedding_model", (q) => q.eq("embeddingModelId", args.modelId))
      .take(cap + 1);

    return {
      modelId: args.modelId ?? null,
      currentModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      remaining: Math.min(remaining.length, cap),
      isAtLeast: remaining.length > cap,
      isDone: remaining.length === 0,
    };
  },
});

export const saveReembeddedChunkInternal = internalMutation({
  args: {
    chunkId: v.id("knowledgeChunks"),
    embedding: v.array(v.number()),
    embeddingProviderKey: v.string(),
    embeddingModelId: v.string(),
    embeddingProviderModelId: v.string(),
    embeddingDimensions: v.number(),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db.get(args.chunkId);
    // The document may have been re-ingested or deleted while the batch was in
    // flight. Writing a vector back onto a row that has moved on is worse than
    // skipping it.
    if (!chunk) return false;

    await ctx.db.patch(args.chunkId, {
      embedding: args.embedding,
      embeddingProviderKey: args.embeddingProviderKey,
      embeddingModelId: args.embeddingModelId,
      embeddingProviderModelId: args.embeddingProviderModelId,
      embeddingDimensions: args.embeddingDimensions,
    });

    return true;
  },
});
