"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { GenerateContentConfig } from "@google/genai";
import { internal } from "./_generated/api";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { createVertexGenAIClient } from "./vertexProviderService";

export const executeSwarmObjective = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.swarmRuntime.clearSwarmLogs, { threadId: args.threadId });

    const ai = createVertexGenAIClient();

    let order = 0;

    const planId = await ctx.runMutation(internal.swarmRuntime.appendSwarmLog, {
      threadId: args.threadId,
      message: "Orchestrator Agent compiling delegation plan...",
      status: "running",
      order: ++order,
      isHeading: true,
    });
    
    const demoAgents = await ctx.runQuery(internal.swarmRuntime.getDemoAgents);
    if (!demoAgents || demoAgents.length === 0) {
        await ctx.runMutation(internal.swarmRuntime.updateSwarmLogStatus, { logId: planId, status: "error" });
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: "Swarm failed: No agents found in the database. Please run the seed command."
        });
        return;
    }

    await ctx.runMutation(internal.swarmRuntime.updateSwarmLogStatus, { logId: planId, status: "success" });

    // Multi-tenant Context Extraction
    const tenantContext = await ctx.runQuery(internal.swarmRuntime.getCompanyContextForThread, { threadId: args.threadId });

    let memoryPayload = `[USER OBJECTIVE / DIRECTIVE FOR SAAAS TENANT: ${tenantContext.name}]:\n`;
    if (tenantContext.systemPrompt) {
        memoryPayload += `[TENANT DEFINITION & RULES]:\n${tenantContext.systemPrompt}\n`;
    }
    memoryPayload += `\n${args.content}\n\n`;
    let lastOutput = "";
    let totalInTokens = 0;
    let totalOutTokens = 0;
    let finalModelConfig: {
      modelId: string;
      providerKey: string;
      providerModelId: string;
    } | null = null;

    for (const agent of demoAgents) {
       if (!agent) continue;
       
       let dynamicMessage = `${agent.name} mapping objective...`;
       if (agent.name.includes("Sourcing")) dynamicMessage = "Market Sourcing Agent querying global networks...";
       if (agent.name.includes("Architect")) dynamicMessage = "Internal Architect crawling local semantic space...";
       if (agent.name.includes("Verification")) dynamicMessage = "Verification Agent auditing raw data flows...";
       if (agent.name.includes("Financial")) dynamicMessage = "Financial Modeler computing predictive vectors...";
       if (agent.name.includes("Synthesis")) dynamicMessage = "Executive Synthesis mapping final matrix report...";

       const logId = await ctx.runMutation(internal.swarmRuntime.appendSwarmLog, {
          threadId: args.threadId,
          message: dynamicMessage,
          status: "running",
          order: ++order,
       });

       const config: GenerateContentConfig = {
           systemInstruction: agent.systemPrompt,
           temperature: 0.1
       };

       if (agent.name.includes("Sourcing")) {
           config.tools = [{ googleSearch: {} }];
       }

       try {
           if (agent.name.includes("Architect")) {
               const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {
                 companyId: tenantContext.companyId ?? undefined,
               });
               const embeddingProviderModelId = getGoogleVertexProviderModelId(embeddingModel, "swarm RAG search");
               const { embeddings } = await ai.models.embedContent({
                 model: embeddingProviderModelId,
                 contents: args.content,
               });
               
               if (embeddings && embeddings.length > 0 && embeddings[0].values?.length === embeddingModel.embeddingDimensions) {
                 const results = tenantContext.companyId
                   ? await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                       vector: embeddings[0].values as number[],
                       limit: 50,
                       filter: (q) => q.eq("companyId", tenantContext.companyId),
                     })
                   : await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                       vector: embeddings[0].values as number[],
                       limit: 50,
                     });
                 let ragContext = "";
                 for (const res of results) {
                   const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                   if (chunk) ragContext += chunk.text + "\\n\\n";
                 }
                 memoryPayload += `\\n[INTERNAL SONAE KNOWLEDGE CONTEXT]:\\n${ragContext}\\n\\n`;
               }
           }

           const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
              requestedModelId: agent.modelId,
              companyId: tenantContext.companyId ?? undefined,
              useCase: "workflow",
           });
           const targetModel = getGoogleVertexProviderModelId(modelConfig, "swarm workflow execution");
           finalModelConfig = modelConfig;
           
           let safePayload = memoryPayload;
           if (safePayload.length > 10000) {
               safePayload = safePayload.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
           }

           const response = await ai.models.generateContent({
              model: targetModel,
              contents: safePayload,
              config
           });

           const output = response.text || "No actionable data recovered.";
           lastOutput = output; 

           totalInTokens += response.usageMetadata?.promptTokenCount || 0;
           totalOutTokens += response.usageMetadata?.candidatesTokenCount || 0;
           
           await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
               agentId: agent._id,
               threadId: args.threadId,
               interactionType: "SWARM MICRO-EXECUTION",
               promptContent: "SWARM MEMORY PAYLOAD OVERRIDDEN",
               responseContent: output,
               companyId: tenantContext.companyId ?? undefined
           });

           memoryPayload += `\n\n==============================\n[INTELLIGENCE FROM: ${agent.name.toUpperCase()}]\n${output}\n==============================\n`;

           await ctx.runMutation(internal.swarmRuntime.updateSwarmLogStatus, { logId, status: "success" });
       } catch (error) {
           console.error(`Swarm Agent Exception (${agent.name}):`, error);
           await ctx.runMutation(internal.swarmRuntime.updateSwarmLogStatus, { logId, status: "error" });
           memoryPayload += `\n\n[WARNING: ${agent.name} encountered structural logic failure]\n`;
       }
    }

    // Pass the finalized synthesis report directly back to the UI feed
    await ctx.runMutation(internal.chat.saveAssistantMessage, {
      threadId: args.threadId,
      content: lastOutput,
      inputTokens: totalInTokens,
      outputTokens: totalOutTokens,
      modelUsed: finalModelConfig?.modelId ?? "sonae-swarm-cluster-v1",
      providerKey: finalModelConfig?.providerKey,
      providerModelId: finalModelConfig?.providerModelId,
    });
  },
});
