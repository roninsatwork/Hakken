"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { GenerateContentConfig } from "@google/genai";
import { internal } from "./_generated/api";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { guardModelTurn } from "./modelTurnService";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";

export const executeSwarmObjective = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // The same safety gate as every other model turn (2026-09 audit: the
    // swarm was the one path that reached a model without it). A refused
    // objective is answered in the thread and never starts an agent.
    const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
    const platformName = (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName;
    const safetyDecision = await guardModelTurn(ctx, {
      content: args.content,
      refusal: { threadId: args.threadId, source: "assistant" },
      platformName,
      ...(thread?.companyId ? { companyId: thread.companyId } : {}),
    });
    if (!safetyDecision.allowed) return;

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
               const queryVector = await embedRetrievalQuery(ctx, {
                 query: args.content,
                 companyId: tenantContext.companyId ?? undefined,
                 operation: "swarmRagEmbedding",
               });

               if (queryVector) {
                 // A swarm without a company reads global knowledge only. The
                 // old fallback here searched with no filter at all, which
                 // would have read every tenant's chunks; the closed scope
                 // type makes that unfiltered search inexpressible now.
                 const results = await searchKnowledgeScope(ctx, {
                   queryVector,
                   queryText: args.content,
                   scope: tenantContext.companyId
                     ? { kind: "company", companyId: tenantContext.companyId }
                     : { kind: "global" },
                   limit: 50,
                 });
                 let ragContext = "";
                 for (const res of results) {
                   const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                   if (chunk) ragContext += chunk.text + "\\n\\n";
                 }
                 memoryPayload += `\\n[INTERNAL PLATFORM KNOWLEDGE CONTEXT]:\\n${ragContext}\\n\\n`;
               }
           }

           const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
              requestedModelId: agent.modelId,
              companyId: tenantContext.companyId ?? undefined,
              useCase: "workflow",
           });
           finalModelConfig = modelConfig;

           let safePayload = memoryPayload;
           if (safePayload.length > 10000) {
               safePayload = safePayload.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
           }

           // A Sourcing agent asks for Google Search grounding, which only
           // Vertex offers, so those stay where the capability lives. Every
           // other swarm agent goes through the registry.
           const needsGoogleSearch = Boolean(config.tools?.length);
           const generated: { text: string; inputTokens: number; outputTokens: number } = needsGoogleSearch
             ? await (async () => {
                 const vertexResponse = await generateVertexContentWithRetry(ai, {
                    model: getGoogleVertexProviderModelId(modelConfig, "internet access for a swarm agent"),
                    contents: safePayload,
                    config
                 }, {
                    operation: "swarmMicroAgentGenerate",
                 });
                 return {
                   text: vertexResponse.text || "",
                   inputTokens: vertexResponse.usageMetadata?.promptTokenCount || 0,
                   outputTokens: vertexResponse.usageMetadata?.candidatesTokenCount || 0,
                 };
               })()
             : await (async () => {
                 const registryResponse = await generateTextWithResolvedModel({
                    model: modelConfig,
                    systemInstruction: agent.systemPrompt || undefined,
                    contents: [{ type: "text", text: safePayload }],
                    temperature: 0.1,
                 });
                 return {
                   text: registryResponse.text || "",
                   inputTokens: registryResponse.inputTokens || 0,
                   outputTokens: registryResponse.outputTokens || 0,
                 };
               })();

           const output = generated.text || "No actionable data recovered.";
           lastOutput = output;

           totalInTokens += generated.inputTokens;
           totalOutTokens += generated.outputTokens;
           
           await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
               agentId: agent._id,
               threadId: args.threadId,
               interactionType: "SWARM MICRO-EXECUTION",
               promptContent: "SWARM MEMORY PAYLOAD OVERRIDDEN",
               responseContent: output,
               companyId: tenantContext.companyId ?? undefined,
               outcome: "SUCCESS"
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
      modelUsed: finalModelConfig?.modelId ?? "hakken-swarm-cluster-v1",
      providerKey: finalModelConfig?.providerKey,
      providerModelId: finalModelConfig?.providerModelId,
    });
  },
});
