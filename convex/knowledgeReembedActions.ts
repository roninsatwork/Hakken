"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { createVertexEmbeddingClient, embedVertexContentWithRetry } from "./vertexProviderService";
import { appError } from "./utils/appError";

/** Small enough that one batch stays well inside an action's budget. */
const DEFAULT_BATCH_SIZE = 25;
/** A re-embed that never finishes should surface rather than loop forever. */
const MAX_BATCHES = 400;

/**
 * Re-embed the knowledge base one batch at a time, rescheduling itself until done.
 *
 * Scheduled rather than looped so a long run is not one enormous action, and so a
 * failure costs one batch rather than the whole job. Progress is readable from the
 * stale count, which falls as batches land.
 *
 * Run it with:
 *   npx convex run knowledgeReembedActions:reembedStaleChunks '{}'
 */
export const reembedStaleChunks = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    batchNumber: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    reembeddedSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    reembeddedThisBatch: number;
    reembeddedSoFar: number;
    isDone: boolean;
  }> => {
    const batchSize = args.batchSize ?? DEFAULT_BATCH_SIZE;
    const batchNumber = args.batchNumber ?? 0;
    const reembeddedSoFar = args.reembeddedSoFar ?? 0;

    if (batchNumber >= MAX_BATCHES) {
      throw appError("INVALID_INPUT", `Re-embed stopped after ${MAX_BATCHES} batches, having re-embedded ${reembeddedSoFar} chunks.`);
    }

    const page = await ctx.runQuery(internal.knowledgeReembed.getStaleChunkPageInternal, {
      cursor: args.cursor ?? null,
      pageSize: batchSize,
    });

    let reembedded = 0;
    if (page.batch.length > 0) {
      // Resolved per batch rather than once, so a model change mid-run is picked up
      // instead of the job finishing against a configuration nobody is using.
      const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {});
      const providerModelId = getGoogleVertexProviderModelId(embeddingModel, "knowledge re-embedding");
      const embeddingAi = createVertexEmbeddingClient();

      for (const chunk of page.batch) {
        const response = await embedVertexContentWithRetry(embeddingAi, {
          model: providerModelId,
          contents: chunk.text,
        }, {
          operation: "knowledgeReembed",
        });
        const values = response.embeddings?.[0]?.values;

        // A vector of the wrong length would be rejected by the index, and writing a
        // short one would corrupt the row. Skipping leaves it stale for a later pass,
        // which is recoverable.
        if (!values || values.length !== embeddingModel.embeddingDimensions) continue;

        const saved = await ctx.runMutation(internal.knowledgeReembed.saveReembeddedChunkInternal, {
          chunkId: chunk.chunkId,
          embedding: values as number[],
          embeddingProviderKey: embeddingModel.providerKey,
          embeddingModelId: embeddingModel.modelId,
          embeddingProviderModelId: providerModelId,
          embeddingDimensions: embeddingModel.embeddingDimensions,
        });
        if (saved) reembedded += 1;
      }

      // The page held stale chunks and none could be written. Rescheduling would
      // walk the whole table producing nothing, so stop and say why.
      if (reembedded === 0) {
        throw appError("UPSTREAM_FAILURE", `Re-embed made no progress on ${page.batch.length} stale chunks. Check the embedding model configuration.`);
      }
    }

    const totalReembedded = reembeddedSoFar + reembedded;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.knowledgeReembedActions.reembedStaleChunks, {
        batchSize,
        batchNumber: batchNumber + 1,
        cursor: page.cursor,
        reembeddedSoFar: totalReembedded,
      });
    }

    return {
      reembeddedThisBatch: reembedded,
      reembeddedSoFar: totalReembedded,
      isDone: page.isDone,
    };
  },
});
