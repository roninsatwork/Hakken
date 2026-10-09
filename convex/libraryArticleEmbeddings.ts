"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { createVertexEmbeddingClient, embedVertexContentWithRetry } from "./vertexProviderService";
import { embeddingInputTokens } from "./vertexUsage";
import { generationSpend, recordModelSpend } from "./modelSpend";

/**
 * Helpful content's sections by meaning (docs/plans/active/insights-helpful-
 * content-plan.md, IH9): each section of a published article embedded with
 * the embedding model set in Admin → AI — the platform's own, as the articles
 * are everyone's — straight after it is saved. Fail-open: a section left
 * without its meaning is still found by its words, and the next save tries
 * again.
 */
export const embedSectionsInternal = internalAction({
  args: { articleId: v.id("libraryArticles") },
  returns: v.number(),
  handler: async (ctx, args) => {
    try {
      const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {});
      const sections = await ctx.runQuery(internal.libraryArticles.sectionsToEmbedInternal, { articleId: args.articleId, embeddingModelId: embeddingModel.modelId });
      if (sections.length === 0) return 0;
      const providerModelId = getGoogleVertexProviderModelId(embeddingModel, "helpful content embedding");
      const client = createVertexEmbeddingClient();
      let embedded = 0;
      let embeddedTokens = 0;
      for (const section of sections) {
        const response = await embedVertexContentWithRetry(client, { model: providerModelId, contents: section.text }, { operation: "helpfulContentEmbedding" });
        embeddedTokens += embeddingInputTokens(response, [section.text]);
        const values = response.embeddings?.[0]?.values;
        // A vector of the wrong length would be refused by the index: left for the next save.
        if (!values || values.length !== embeddingModel.embeddingDimensions) continue;
        await ctx.runMutation(internal.libraryArticles.saveSectionEmbeddingInternal, { sectionId: section.sectionId, embedding: values as number[], embeddingModelId: embeddingModel.modelId });
        embedded += 1;
      }
      // One row an article, charged to Platform AI: the articles are everyone's.
      await recordModelSpend(ctx, {
        actionContext: `Embedding a Helpful content article (${sections.length} sections)`,
        ...generationSpend(embeddingModel, { inputTokens: embeddedTokens }),
      });
      return embedded;
    } catch (error) {
      console.error("Helpful content embedding failed; its sections are still found by their words", error);
      return 0;
    }
  },
});
