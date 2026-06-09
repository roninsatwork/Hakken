"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Content, FunctionDeclaration, GenerateContentConfig, Tool } from "@google/genai";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { parseDocuments } from "./utils/fileParser";
import { redactPII, DEFAULT_PII_CONFIG } from "./utils/pii";
import {
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  type ToolAccessRole,
} from "./aiToolExecutionService";
import { buildAgentSystemInstruction, buildUntrustedKnowledgeContext } from "./aiPromptAssembly";
import { evaluateAssistantSafety } from "./aiSafetyPolicy";
import {
  createVertexGenAIClient,
  embedVertexContentWithRetry,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { getGoogleVertexProviderModelId } from "./aiModelService";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Engine Exception";
}

export const generateAgentResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const safetyDecision = evaluateAssistantSafety(args.content);
    if (!safetyDecision.allowed) {
        await ctx.runMutation(internal.chat.saveAssistantSafetyRefusal, {
            threadId: args.threadId,
            content: safetyDecision.response,
            category: safetyDecision.category,
            source: "agent",
        });
        return;
    }

    const ai = createVertexGenAIClient();

    try {
        // 1. Fetch Agent Identity & System Prompt
        const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
        if (!agent) throw new Error("Agent not found.");

        const systemInstruction = buildAgentSystemInstruction(agent.systemPrompt);

        // 2. Fetch Conversation History 
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        if (!thread) throw new Error("Thread context missing");

        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
           requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
           companyId: thread.companyId,
           useCase: "agent",
        });
        const targetModel = getGoogleVertexProviderModelId(modelConfig, "agent tool runtime");

        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });

        // Map Sonae generic messages into expected Vertex AI Content arrays
        const conversationHistory: Content[] = messages.slice(-20).map((msg) => {
            return {
                role: msg.role === "user" ? "user" : "model",
                parts: [{ text: msg.content }]
            };
        });

        // Add the current user prompt
        let currentUserContent = args.content;
        
        if (args.fileIds && args.fileIds.length > 0) {
            const documentText = await parseDocuments(ctx, args.fileIds);
            if (documentText) {
                currentUserContent += buildUntrustedKnowledgeContext({
                    sourceLabel: "attached documents for this prompt",
                    chunks: [documentText],
                    maxChars: 10000,
                });
            }
        }

        if (currentUserContent.length > 10000) {
            currentUserContent = currentUserContent.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
        }

        conversationHistory.push({
            role: "user",
            parts: [{ text: currentUserContent }]
        });

        // 3. Fetch Assigned Connectors (Tools)
        const agentTools = await ctx.runQuery(internal.agents.getAgentToolsInternal, { agentId: args.agentId });
        
        // Build the Tools Declaration block for @google/genai
        const dynamicTools: FunctionDeclaration[] = [];
        const toolAccessByName = new Map<string, ToolAccessRole>();
        
        for (const junction of agentTools) {
             const toolDef = await ctx.runQuery(internal.aiTools.getToolInternal, { id: junction.toolId });
             const schemaStr = toolDef && "inputSchema" in toolDef && typeof toolDef.inputSchema === "string"
                 ? toolDef.inputSchema
                 : undefined;
             if (toolDef && schemaStr) {
                 try {
                     const declaration = buildProviderToolDeclaration({
                         name: toolDef.name,
                         description: toolDef.description,
                         handlerMapping: toolDef.handlerMapping,
                         requiredRole: toolDef.requiredRole,
                         inputSchema: schemaStr,
                     });
                     dynamicTools.push(declaration as FunctionDeclaration);
                     toolAccessByName.set(declaration.name, toolDef.requiredRole);
                 } catch (error) {
                     console.error("Failed to parse tool schema for:", toolDef.name, getErrorMessage(error));
                 }
             }
        }

        // --- RAG VECTOR SEARCH PIPELINE (Agent Isolated) ---
        let ragContext = "";
        try {
            const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {
                companyId: thread.companyId,
            });
            const embeddingProviderModelId = getGoogleVertexProviderModelId(embeddingModel, "agent RAG search");
            const userEmbeddingResp = await embedVertexContentWithRetry(ai, {
                model: embeddingProviderModelId,
                contents: args.content
            }, {
                operation: "agentRagEmbedding",
            });
            
            const queryVector = userEmbeddingResp.embeddings?.[0]?.values;
            
            if (queryVector && queryVector.length === embeddingModel.embeddingDimensions) {
                const vectorMatches = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                    vector: queryVector as number[],
                    limit: 100, // Matching the maximum RAG boundary limit
                    filter: (q) => q.eq("agentId", args.agentId)
                });
                
                if (vectorMatches.length > 0) {
                    const MAX_RAG_CHARS = 32000;
                    const chunkTexts: string[] = [];
                    let chunkTextLength = 0;

                    for (const res of vectorMatches) {
                       if (chunkTextLength >= MAX_RAG_CHARS) {
                          break;
                       }
                       const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                       if (chunk) {
                          if (chunkTextLength + chunk.text.length > MAX_RAG_CHARS) {
                             break;
                          }
                          chunkTexts.push(chunk.text);
                          chunkTextLength += chunk.text.length;
                       }
                    }

                    if (chunkTexts.length > 0) {
                        ragContext = buildUntrustedKnowledgeContext({
                            sourceLabel: "agent-scoped knowledge",
                            chunks: chunkTexts,
                            maxChars: MAX_RAG_CHARS,
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Agent RAG pipeline failed to execute", e);
        }

        const finalSystemInstruction = systemInstruction;
        if (ragContext) {
             // Append to the final user message to prioritize context grounding over system instruction fading
             const finalMessage = conversationHistory[conversationHistory.length - 1];
             const finalTextPart = finalMessage?.parts?.[0];
             if (finalTextPart?.text) {
                 finalTextPart.text += ragContext;
             }
        }

        const genConfig: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            temperature: 0.1, // Deterministic logic routing
        };

        if (dynamicTools.length > 0) {
            genConfig.tools = [{
                functionDeclarations: dynamicTools
            }];
        }

        // --- MULTI-PASS GENERATION LOOP ---
        
        // Pass 1: Initial call to Model
        let response = await generateVertexContentWithRetry(ai, {
             model: targetModel,
             contents: conversationHistory,
             config: genConfig
        }, {
             operation: "agentGeneratePassOne",
        });

        // Did the model request a tool?
        if (response.functionCalls && response.functionCalls.length > 0) {
            const funcCall = response.functionCalls[0];
            const toolCall = parseToolCallPayload({ name: funcCall.name, callArgs: funcCall.args });
            const rawArgsString = JSON.stringify(toolCall.args);
            const redactedArgsString = redactPII(rawArgsString, DEFAULT_PII_CONFIG);
            console.log("Agent requested function call:", toolCall.name, redactedArgsString);
            
            // Log Telemetry: Tool Dispatch
            if (args.agentId) {
               await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                   agentId: args.agentId,
                   threadId: args.threadId,
                   interactionType: `TOOL DISPATCH: ${toolCall.name}`,
                   promptContent: args.content,
                   responseContent: `{"functionCall": {"name": "${toolCall.name}", "args": ${redactedArgsString}}}`,
                   companyId: thread.companyId
               });
            }

            // *** TODO: Execute the actual back-end hook mapping here ***
            // SECURITY NOTICE: When implementing the actual tool execution backend wrapper,
            // you MUST retrieve the caller's session using getAuthUserId(ctx) and verify that
            // they have sufficient permissions (roles/company mapping) to execute the target tool.
            // DO NOT blindly trust the agent's intent, as it could be prompt-injected.
            const currentUser = thread.userId
                ? await ctx.runQuery(internal.users.getUserInternal, { userId: thread.userId })
                : null;
            const requiredRole = toolAccessByName.get(toolCall.name) ?? "SUPER_ADMIN";
            const accessDecision = canExecuteTool({
                requiredRole,
                userRole: currentUser?.role,
                userCompanyId: currentUser?.companyId,
                targetCompanyId: thread.companyId,
            });
            const mockToolResponse = accessDecision.allowed
                ? buildToolResultPayload({
                    status: "success",
                    data: "Mocked backend response payload from Sonae Integrations Hub",
                })
                : buildToolFailureResult(new Error(accessDecision.reason));

            // Inject the Function Call and Function Response into the conversation history
            conversationHistory.push({
                role: "model",
                parts: [{
                    functionCall: {
                        name: toolCall.name,
                        args: toolCall.args
                    }
                }]
            });
            
            conversationHistory.push({
                role: "function",
                parts: [{
                    functionResponse: {
                        name: toolCall.name,
                        response: { name: toolCall.name, content: mockToolResponse }
                    }
                }]
            });

            // Pass 2: Let the model synthesize the backend data into English
            response = await generateVertexContentWithRetry(ai, {
                model: targetModel,
                contents: conversationHistory,
                config: genConfig
            }, {
                operation: "agentGenerateToolSynthesis",
            });
        }

        // Final Extraction
        const assistantReply = response.text || "Execution completed with no readable text output.";

        const inTokens = response.usageMetadata?.promptTokenCount || 0;
        const outTokens = response.usageMetadata?.candidatesTokenCount || 0;
        
        // Calculate dynamic cost based on the exact model utilized
        const allModelsRaw = await ctx.runQuery(internal.aiModels.getAllModelsInternal, {});
        const modelMap = new Map<string, Doc<"aiModels">>(allModelsRaw.map((m) => [m.modelId, m]));
        const config = modelMap.get(modelConfig.modelId);
        
        const inRate = config ? (inTokens > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
        const outRate = config ? (config.outputResponseCost || 0) : 0;
        const calculatedCost = (inTokens / 1000000) * inRate + (outTokens / 1000000) * outRate;

        // Write response back to DB
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: assistantReply,
            inputTokens: inTokens,
            outputTokens: outTokens,
            modelUsed: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId
        });

        // Log Telemetry: Final Output
        if (args.agentId) {
            // Write the explicit execution log for non-tool synthesis
            await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                agentId: args.agentId,
                threadId: args.threadId,
                interactionType: "LLM SYNTHESIS",
                promptContent: args.content,
                responseContent: assistantReply,
                companyId: thread.companyId
            });

            if (thread.userId) {
                await ctx.runMutation(internal.agentTransactions.insertTransactionInternal, {
                    agentId: args.agentId,
                    threadId: args.threadId,
                    userId: thread.userId,
                    companyId: thread.companyId,
                    actionContext: "Sandbox Execution",
                    modelUsed: modelConfig.modelId,
                    providerKey: modelConfig.providerKey,
                    providerModelId: modelConfig.providerModelId,
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    costGBP: calculatedCost,
                    status: "SUCCESS"
                });
            }
        }

    } catch (error: unknown) {
        console.error("Agent Engine Error:", error);
        const errorMessage = normalizeAiRuntimeError(error, "Agent execution failed.").error;
        
        if (args.agentId) {
             await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                 agentId: args.agentId,
                 threadId: args.threadId,
                 interactionType: "ERROR",
                 promptContent: args.content,
                 responseContent: errorMessage
             });
        }

        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: "Agent Execution Offline: Encountered an unhandled exception in the function calling runtime."
        });
    }
  },
});

export const executeAgentNode = internalAction({
  args: {
    agentId: v.id("agents"),
    input: v.string(),
  },
  handler: async (ctx, args) => {
    const ai = createVertexGenAIClient();

    const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
    if (!agent) throw new Error("Agent not found.");

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
       requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
       useCase: "workflow",
    });
    const targetModel = getGoogleVertexProviderModelId(modelConfig, "workflow agent execution");

    const systemInstruction = agent.systemPrompt || "You are a specialized agent in a workflow.";
    
    // Check if tools or internet access are enabled
    const tools: Tool[] = [];
    if (agent.allowInternetAccess) {
        tools.push({ googleSearch: {} });
    }
    
    const config: GenerateContentConfig = {
        systemInstruction: systemInstruction,
        temperature: agent.temperature !== undefined ? agent.temperature : 0.1,
    };
    
    if (tools.length > 0) {
        config.tools = tools;
    }

    if (agent.outputSchema) {
        try {
            config.responseMimeType = "application/json";
            config.responseJsonSchema = JSON.parse(agent.outputSchema);
        } catch (e) {
            console.error("Failed to parse output schema", e);
        }
    }

    let safeInput = args.input;
    if (safeInput.length > 10000) {
        safeInput = safeInput.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
    }

    const response = await generateVertexContentWithRetry(ai, {
        model: targetModel,
        contents: `Input Data:\n${safeInput}`,
        config: config
    }, {
        operation: "workflowAgentNodeGenerate",
    });

    const output = response.text || "{}";

    // Log Execution for Observability
    await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
        agentId: args.agentId,
        interactionType: "WORKFLOW_EXECUTION",
        promptContent: args.input,
        responseContent: output,
    });

    return {
        output,
        usage: {
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        }
    };
  },
});
