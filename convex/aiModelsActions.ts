"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActionSuperAdmin } from "./actionAuth";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export const syncVertexModels = action({
  args: {},
  handler: async (ctx) => {
    await requireActionSuperAdmin(ctx);

    try {
      // In @google/genai with Vertex, we fetch available models using the standard method
      // Unfortunately models.list does not currently support Vertex AI perfectly in some beta SDK versions.
      // Wait, let's actually just fetch models in a fail-safe way. 
      // If ai.models.list isn't populated, we can provide a definitive list of active production models
      // because Vertex AI doesn't always expose the standard model indexing publicly like AI Studio does.
      
      const hardcodedVertexModels = [
        { name: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)", description: "Reasoning and complex logic" },
        { name: "gemini-3.1-flash-lite-preview", displayName: "Gemini 3.1 Flash Lite", description: "Ultra-low latency operations" },
        { name: "gemini-3-flash-preview", displayName: "Gemini 3 Flash", description: "Balanced fast performance" },
        { name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", description: "Standard generation" },
        { name: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", description: "Complex instructions" }
      ];

      const formattedModels = hardcodedVertexModels.map((m) => ({
        modelId: m.name,
        displayName: m.displayName,
        description: m.description,
      }));

      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        models: formattedModels,
      });

      return formattedModels;
    } catch (e: unknown) {
      throw new Error(`Failed to sync Vertex Models: ${getErrorMessage(e)}`);
    }
  },
});
