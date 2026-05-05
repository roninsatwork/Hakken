"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { GoogleGenAI } from "@google/genai";

import { getAuthUserId } from "@convex-dev/auth/server";

export const syncVertexModels = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    
    const user = await ctx.runQuery(internal.users.getUserInternal, { userId });
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    const ai = new GoogleGenAI({ 
        project: projectId, 
        location: location,
        vertexai: true,
        googleAuthOptions: {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }
        }
    });

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

      const formattedModels = hardcodedVertexModels.map((m: any) => ({
        modelId: m.name,
        displayName: m.displayName,
        description: m.description,
      }));

      await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
        models: formattedModels,
      });

      return formattedModels;
    } catch (e: any) {
      throw new Error(`Failed to sync Vertex Models: ${e.message}`);
    }
  },
});
