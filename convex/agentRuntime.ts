"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Content, FunctionDeclaration, GenerateContentConfig, Tool } from "@google/genai";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { parseDocuments } from "./utils/fileParser";
import { redactPII, DEFAULT_PII_CONFIG } from "./utils/pii";
import {
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  validateToolCallArgsAgainstSchema,
  type ToolAccessRole,
  type ToolSideEffectLevel,
} from "./aiToolExecutionService";
import { buildAgentSystemInstruction, buildUntrustedKnowledgeContext } from "./aiPromptAssembly";
import { evaluateAssistantSafety } from "./aiSafetyPolicy";
import {
  createVertexGenAIClient,
  embedVertexContentWithRetry,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import {
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
  getAgentStepStatusFromToolStatus,
  getCostBudgetStopMessage,
  getRuntimeBudgetStopMessage,
  getTokenBudgetStopMessage,
  getToolBudgetStopMessage,
  shouldStopForCostBudget,
  shouldStopForRuntimeBudget,
  shouldStopForTokenBudget,
  shouldStopForToolBudget,
} from "./agentRuntimeService";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Engine Exception";
}

type RuntimeToolMetadata = {
    toolId: Id<"aiTools">;
    requiredRole: ToolAccessRole;
    handlerMapping: string;
    inputSchema?: string;
    sideEffectLevel: ToolSideEffectLevel;
    confirmationRequired: boolean;
};

function getToolConfirmationRequired(sideEffectLevel: ToolSideEffectLevel, configured?: boolean) {
    return sideEffectLevel === "READ" ? (configured ?? false) : true;
}

function getStringToolArg(args: Record<string, unknown>, key: string) {
    const value = args[key];
    return typeof value === "string" ? value.trim() : "";
}

function getNumberToolArg(args: Record<string, unknown>, key: string) {
    const value = args[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getOptionalStringToolArg(args: Record<string, unknown>, key: string) {
    const value = args[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function calculateModelCostGBP(args: {
    inputTokens: number;
    outputTokens: number;
    config?: Doc<"aiModels">;
}) {
    const inRate = args.config
        ? (args.inputTokens > 200000
            ? (args.config.standardInputCostAbove200k || 0)
            : (args.config.standardInputCostBelow200k || 0))
        : 0;
    const outRate = args.config ? (args.config.outputResponseCost || 0) : 0;
    return (args.inputTokens / 1000000) * inRate + (args.outputTokens / 1000000) * outRate;
}

function isConfirmationRequiredDenial(reason?: string) {
    return reason === "Tool execution requires explicit user confirmation.";
}

function getApprovalRequiredMessage(toolName: string) {
    return `Approval required before continuing. The agent requested "${toolName}", and an administrator must approve or reject that tool call.`;
}

export const runAgentObjective = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    let agentRunId: Id<"agentRuns"> | undefined;
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

        agentRunId = await ctx.runMutation(internal.agentRuns.createRunInternal, {
            agentId: args.agentId,
            threadId: args.threadId,
            triggerType: "CHAT",
            objective: args.content,
            status: "RUNNING",
            companyId: thread.companyId,
            userId: thread.userId,
            modelId: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
            maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        });
        const runId = agentRunId;
        let preLoopStepIndex = 0;

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

        const memoryMatches = await ctx.runQuery(internal.agentMemories.searchMemoryInternal, {
            agentId: args.agentId,
            companyId: thread.companyId,
            queryText: args.content,
            limit: 5,
        });
        if (memoryMatches.length > 0) {
            await ctx.runMutation(internal.agentMemories.recordUsageInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                queryText: args.content,
                memories: memoryMatches.map((memory) => ({ memoryId: memory.id, score: memory.score })),
            });
            preLoopStepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                stepIndex: preLoopStepIndex,
                kind: "OBSERVE",
                status: "SUCCESS",
                input: args.content,
                output: JSON.stringify({ memories: memoryMatches.map((memory) => ({ id: memory.id, kind: memory.kind, score: memory.score })) }),
            });
            currentUserContent += buildUntrustedKnowledgeContext({
                sourceLabel: "agent memory",
                chunks: memoryMatches.map((memory) => memory.content),
                maxChars: 6000,
            });
        }

        conversationHistory.push({
            role: "user",
            parts: [{ text: currentUserContent }]
        });

        // 3. Fetch Assigned Connectors (Tools)
        const agentTools = await ctx.runQuery(internal.agents.getAgentToolsInternal, { agentId: args.agentId });
        
        // Build the Tools Declaration block for @google/genai
        const dynamicTools: FunctionDeclaration[] = [];
        const toolMetadataByName = new Map<string, RuntimeToolMetadata>();
        
        for (const junction of agentTools) {
             const toolDef = await ctx.runQuery(internal.aiTools.getToolInternal, { id: junction.toolId });
             if (toolDef?.isActive === false) continue;
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
                     const sideEffectLevel = (toolDef.sideEffectLevel || "READ") as ToolSideEffectLevel;
                     toolMetadataByName.set(declaration.name, {
                         toolId: toolDef._id,
                         requiredRole: toolDef.requiredRole,
                         handlerMapping: toolDef.handlerMapping,
                         inputSchema: schemaStr,
                         sideEffectLevel,
                         confirmationRequired: getToolConfirmationRequired(sideEffectLevel, toolDef.confirmationRequired),
                     });
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

        const allModelsRaw = await ctx.runQuery(internal.aiModels.getAllModelsInternal, {});
        const modelMap = new Map<string, Doc<"aiModels">>(allModelsRaw.map((m) => [m.modelId, m]));
        const config = modelMap.get(modelConfig.modelId);

        // --- BOUNDED OBJECTIVE LOOP ---
        let assistantReply = "";
        let finalStepStatus: "SUCCESS" | "FAILED" = "SUCCESS";
        let stepIndex = preLoopStepIndex;
        let toolCallCount = 0;
        let inTokens = 0;
        let outTokens = 0;
        const runStartedAt = Date.now();

        for (let loopIndex = 0; loopIndex < DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps; loopIndex += 1) {
            const response = await generateVertexContentWithRetry(ai, {
                model: targetModel,
                contents: conversationHistory,
                config: genConfig
            }, {
                operation: toolCallCount === 0 ? "agentGeneratePassOne" : "agentGenerateToolSynthesis",
            });

            const responseInputTokens = response.usageMetadata?.promptTokenCount || 0;
            const responseOutputTokens = response.usageMetadata?.candidatesTokenCount || 0;
            inTokens += responseInputTokens;
            outTokens += responseOutputTokens;
            const estimatedCostGBP = calculateModelCostGBP({
                inputTokens: inTokens,
                outputTokens: outTokens,
                config,
            });

            const requestedToolCalls = response.functionCalls?.length ?? 0;
            stepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                stepIndex,
                kind: "MODEL",
                status: "SUCCESS",
                input: JSON.stringify({ loopIndex, completedToolCalls: toolCallCount }),
                output: response.text || JSON.stringify({
                    functionCalls: (response.functionCalls ?? []).map((call) => ({ name: call.name })),
                }),
                modelId: modelConfig.modelId,
                providerKey: modelConfig.providerKey,
                providerModelId: modelConfig.providerModelId,
                inputTokens: responseInputTokens,
                outputTokens: responseOutputTokens,
            });

            if (requestedToolCalls === 0) {
                assistantReply = response.text || "Execution completed with no readable text output.";
                break;
            }

            if (shouldStopForRuntimeBudget({
                elapsedMs: Date.now() - runStartedAt,
                maxRuntimeMs: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxRuntimeMs,
            })) {
                assistantReply = getRuntimeBudgetStopMessage(DEFAULT_AGENT_OBJECTIVE_LIMITS.maxRuntimeMs);
                finalStepStatus = "FAILED";
                break;
            }

            if (shouldStopForTokenBudget({
                inputTokens: inTokens,
                outputTokens: outTokens,
                maxInputTokens: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxInputTokens,
                maxOutputTokens: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxOutputTokens,
            })) {
                assistantReply = getTokenBudgetStopMessage();
                finalStepStatus = "FAILED";
                break;
            }

            if (shouldStopForCostBudget({
                costGBP: estimatedCostGBP,
                maxCostGBP: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostGBP,
            })) {
                assistantReply = getCostBudgetStopMessage(DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostGBP);
                finalStepStatus = "FAILED";
                break;
            }

            if (shouldStopForToolBudget({
                requestedToolCalls,
                completedToolCalls: toolCallCount,
                maxToolCalls: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls,
            })) {
                assistantReply = getToolBudgetStopMessage(DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls);
                finalStepStatus = "FAILED";
                break;
            }

            const funcCall = response.functionCalls?.[0];
            if (!funcCall) {
                assistantReply = "Execution completed with no readable text output.";
                break;
            }

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

            const currentUser = thread.userId
                ? await ctx.runQuery(internal.users.getUserInternal, { userId: thread.userId })
                : null;
            const toolMetadata = toolMetadataByName.get(toolCall.name);
            const requiredRole = toolMetadata?.requiredRole ?? "SUPER_ADMIN";
            const schemaValidation = validateToolCallArgsAgainstSchema({
                schema: toolMetadata?.inputSchema,
                callArgs: toolCall.args,
            });
            const accessDecision = canExecuteTool({
                requiredRole,
                userRole: currentUser?.role,
                userCompanyId: currentUser?.companyId,
                targetCompanyId: thread.companyId,
                sideEffectLevel: toolMetadata?.sideEffectLevel,
                confirmationRequired: toolMetadata?.confirmationRequired,
            });

            if (
                schemaValidation.ok &&
                toolMetadata &&
                !accessDecision.allowed &&
                isConfirmationRequiredDenial(accessDecision.reason)
            ) {
                toolCallCount += 1;
                const approvalMessage = getApprovalRequiredMessage(toolCall.name);
                stepIndex += 1;
                const toolStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                    runId,
                    agentId: args.agentId,
                    companyId: thread.companyId,
                    stepIndex,
                    kind: "TOOL_CALL",
                    status: "PENDING",
                    input: redactedArgsString,
                    output: approvalMessage,
                });

                const toolCallId = await ctx.runMutation(internal.agentRuns.insertToolCallInternal, {
                    runId,
                    stepId: toolStepId,
                    agentId: args.agentId,
                    toolId: toolMetadata.toolId,
                    normalizedToolName: toolCall.name,
                    handlerMapping: toolMetadata.handlerMapping,
                    argumentsJson: rawArgsString,
                    redactedArgumentsJson: redactedArgsString,
                    status: "APPROVAL_REQUIRED",
                    requiredRole,
                    sideEffectLevel: toolMetadata.sideEffectLevel,
                    confirmationRequired: true,
                    companyId: thread.companyId,
                    userId: thread.userId,
                });

                stepIndex += 1;
                const approvalStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                    runId,
                    agentId: args.agentId,
                    companyId: thread.companyId,
                    stepIndex,
                    kind: "APPROVAL_REQUEST",
                    status: "PENDING",
                    input: redactedArgsString,
                    output: approvalMessage,
                });

                await ctx.runMutation(internal.agentRuns.insertApprovalInternal, {
                    runId,
                    stepId: approvalStepId,
                    toolCallId,
                    agentId: args.agentId,
                    companyId: thread.companyId,
                    requestedBy: thread.userId,
                    status: "PENDING",
                    message: approvalMessage,
                    previewJson: JSON.stringify({
                        tool: toolCall.name,
                        handlerMapping: toolMetadata.handlerMapping,
                        arguments: toolCall.args,
                        sideEffectLevel: toolMetadata.sideEffectLevel,
                    }),
                });

                const calculatedCost = calculateModelCostGBP({
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    config,
                });
                await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
                    runId,
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    costGBP: calculatedCost,
                    modelId: modelConfig.modelId,
                    providerKey: modelConfig.providerKey,
                    providerModelId: modelConfig.providerModelId,
                });
                await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
                    runId,
                    status: "PENDING_APPROVAL",
                    finalOutput: approvalMessage,
                });
                await ctx.runMutation(internal.chat.saveAssistantMessage, {
                    threadId: args.threadId,
                    content: approvalMessage,
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    modelUsed: modelConfig.modelId,
                    providerKey: modelConfig.providerKey,
                    providerModelId: modelConfig.providerModelId,
                });
                return;
            }

            let toolStatus: "SUCCESS" | "FAILED" | "DENIED" | "CANCELLED" = "FAILED";
            let toolError: string | undefined;
            let toolResponsePayload;

            if (!schemaValidation.ok) {
                toolError = schemaValidation.errors.join(" ");
                toolResponsePayload = buildToolResultPayload({
                    status: "error",
                    error: toolError,
                });
            } else if (!accessDecision.allowed) {
                toolStatus = "DENIED";
                toolError = accessDecision.reason;
                toolResponsePayload = buildToolFailureResult(new Error(accessDecision.reason));
            } else if (!toolMetadata) {
                toolError = "Unknown tool requested by model.";
                toolResponsePayload = buildToolResultPayload({
                    status: "error",
                    error: toolError,
                });
            } else if (toolMetadata.handlerMapping === "knowledge.search") {
                const query = getStringToolArg(toolCall.args, "query") || args.content;
                const limit = getNumberToolArg(toolCall.args, "limit");
                const result = await ctx.runQuery(internal.aiToolReadTools.searchKnowledge, {
                    query,
                    agentId: args.agentId,
                    companyId: thread.companyId,
                    limit,
                });
                toolStatus = "SUCCESS";
                toolResponsePayload = buildToolResultPayload({
                    status: "success",
                    data: result,
                });
            } else if (toolMetadata.handlerMapping === "company.overview.update") {
                if (!thread.companyId) {
                    throw new Error("Company overview updates require a tenant context.");
                }
                if (!thread.userId) {
                    throw new Error("Company overview updates require an authenticated actor.");
                }
                const overview = getStringToolArg(toolCall.args, "overview");
                const idempotencyKey = getOptionalStringToolArg(toolCall.args, "idempotencyKey");
                const result = await ctx.runMutation(internal.aiToolWriteTools.updateCompanyOverview, {
                    companyId: thread.companyId,
                    actorId: thread.userId,
                    overview,
                    runId,
                    toolCallId: undefined,
                    idempotencyKey,
                });
                toolStatus = "SUCCESS";
                toolResponsePayload = buildToolResultPayload({
                    status: "success",
                    data: result,
                });
            } else {
                toolError = "Unknown or unimplemented tool handler mapping.";
                toolResponsePayload = buildToolResultPayload({
                    status: "error",
                    error: toolError,
                });
            }

            toolCallCount += 1;
            stepIndex += 1;
            const toolStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                stepIndex,
                kind: "TOOL_CALL",
                status: getAgentStepStatusFromToolStatus(toolStatus),
                input: redactedArgsString,
                output: JSON.stringify(toolResponsePayload),
                error: toolError,
            });

            await ctx.runMutation(internal.agentRuns.insertToolCallInternal, {
                runId,
                stepId: toolStepId,
                agentId: args.agentId,
                toolId: toolMetadata?.toolId,
                normalizedToolName: toolCall.name,
                handlerMapping: toolMetadata?.handlerMapping ?? toolCall.name,
                argumentsJson: rawArgsString,
                redactedArgumentsJson: redactedArgsString,
                resultJson: JSON.stringify(toolResponsePayload),
                status: toolStatus,
                requiredRole,
                sideEffectLevel: toolMetadata?.sideEffectLevel ?? "READ",
                confirmationRequired: toolMetadata?.confirmationRequired ?? false,
                companyId: thread.companyId,
                userId: thread.userId,
                error: toolError,
            });

            stepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                stepIndex,
                kind: "TOOL_RESULT",
                status: getAgentStepStatusFromToolStatus(toolStatus),
                input: toolCall.name,
                output: JSON.stringify(toolResponsePayload),
                error: toolError,
            });

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
                        response: { name: toolCall.name, content: toolResponsePayload }
                    }
                }]
            });
        }

        if (!assistantReply) {
            assistantReply = getToolBudgetStopMessage(DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls);
            finalStepStatus = "FAILED";
        }

        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
            runId,
            agentId: args.agentId,
            companyId: thread.companyId,
            stepIndex,
            kind: "FINAL",
            status: finalStepStatus,
            output: assistantReply,
            modelId: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
            inputTokens: inTokens,
            outputTokens: outTokens,
        });
        
        const calculatedCost = calculateModelCostGBP({
            inputTokens: inTokens,
            outputTokens: outTokens,
            config,
        });

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

        await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
            runId: agentRunId,
            inputTokens: inTokens,
            outputTokens: outTokens,
            costGBP: calculatedCost,
            modelId: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
        });

        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
            runId: agentRunId,
            status: finalStepStatus,
            finalOutput: assistantReply,
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
                    status: finalStepStatus
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

        if (agentRunId) {
            await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
                runId: agentRunId,
                status: "FAILED",
                error: errorMessage,
            });
        }

        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: "Agent Execution Offline: Encountered an unhandled exception in the function calling runtime."
        });
    }
  },
});

export const generateAgentResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.agentRuntime.runAgentObjective, args);
  },
});

const triggeredAgentRunTriggerValidator = v.union(
  v.literal("MANUAL"),
  v.literal("SCHEDULE"),
  v.literal("WEBHOOK"),
  v.literal("WORKFLOW"),
  v.literal("EVENT")
);

export const runTriggeredAgentObjective = internalAction({
  args: {
    agentId: v.id("agents"),
    objective: v.string(),
    triggerType: triggeredAgentRunTriggerValidator,
    runId: v.optional(v.id("agentRuns")),
    workflowId: v.optional(v.id("workflows")),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    scheduleId: v.optional(v.id("schedules")),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<{ output: string; runId: Id<"agentRuns"> }> => {
    let runId = args.runId;
    const safetyDecision = evaluateAssistantSafety(args.objective);
    const ai = createVertexGenAIClient();

    try {
      const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
      if (!agent) throw new Error("Agent not found.");
      if (agent.isActive === false) throw new Error("Agent is inactive.");

      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
        companyId: args.companyId,
        useCase: args.triggerType === "WORKFLOW" ? "workflow" : "agent",
      });
      const targetModel = getGoogleVertexProviderModelId(modelConfig, "triggered agent execution");

      if (!runId) {
        runId = await ctx.runMutation(internal.agentRuns.createRunInternal, {
          agentId: args.agentId,
          workflowId: args.workflowId,
          scheduleId: args.scheduleId,
          triggerType: args.triggerType,
          objective: args.objective,
          status: "RUNNING",
          companyId: args.companyId,
          userId: args.userId,
          modelId: modelConfig.modelId,
          providerKey: modelConfig.providerKey,
          providerModelId: modelConfig.providerModelId,
          maxSteps: 1,
        });
      } else {
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "RUNNING",
        });
      }

      if (!safetyDecision.allowed) {
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex: 1,
          kind: "FINAL",
          status: "FAILED",
          output: safetyDecision.response,
          error: safetyDecision.category,
        });
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "FAILED",
          finalOutput: safetyDecision.response,
          error: safetyDecision.category,
        });
        if (args.workflowExecutionId) {
          await ctx.runMutation(internal.scheduler.completeAgentExecution, {
            executionId: args.workflowExecutionId,
            agentRunId: runId,
            success: false,
            output: safetyDecision.response,
          });
        }
        return { output: safetyDecision.response, runId };
      }

      let objectiveContent = args.objective;
      let stepIndex = 0;
      const memoryMatches = await ctx.runQuery(internal.agentMemories.searchMemoryInternal, {
        agentId: args.agentId,
        companyId: args.companyId,
        queryText: args.objective,
        limit: 5,
      });
      if (memoryMatches.length > 0) {
        await ctx.runMutation(internal.agentMemories.recordUsageInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          queryText: args.objective,
          memories: memoryMatches.map((memory) => ({ memoryId: memory.id, score: memory.score })),
        });
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({ memories: memoryMatches.map((memory) => ({ id: memory.id, kind: memory.kind, score: memory.score })) }),
        });
        objectiveContent += buildUntrustedKnowledgeContext({
          sourceLabel: "agent memory",
          chunks: memoryMatches.map((memory) => memory.content),
          maxChars: 6000,
        });
      }

      const response = await generateVertexContentWithRetry(ai, {
        model: targetModel,
        contents: [{
          role: "user",
          parts: [{ text: objectiveContent }],
        }] satisfies Content[],
        config: {
          systemInstruction: buildAgentSystemInstruction(agent.systemPrompt),
          temperature: agent.temperature !== undefined ? agent.temperature : 0.1,
        },
      }, {
        operation: "triggeredAgentGenerate",
      });

      const output = response.text || "Execution completed with no readable text output.";
      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const allModelsRaw = await ctx.runQuery(internal.aiModels.getAllModelsInternal, {});
      const modelMap = new Map<string, Doc<"aiModels">>(allModelsRaw.map((m) => [m.modelId, m]));
      const costGBP = calculateModelCostGBP({
        inputTokens,
        outputTokens,
        config: modelMap.get(modelConfig.modelId),
      });

      await ctx.runMutation(internal.agentRuns.appendStepInternal, {
        runId,
        agentId: args.agentId,
        companyId: args.companyId,
        stepIndex: stepIndex + 1,
        kind: "MODEL",
        status: "SUCCESS",
        input: args.objective,
        output,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
        inputTokens,
        outputTokens,
      });
      await ctx.runMutation(internal.agentRuns.appendStepInternal, {
        runId,
        agentId: args.agentId,
        companyId: args.companyId,
        stepIndex: stepIndex + 2,
        kind: "FINAL",
        status: "SUCCESS",
        output,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
        inputTokens,
        outputTokens,
        costGBP,
      });
      await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
        runId,
        inputTokens,
        outputTokens,
        costGBP,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
      });
      await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
        runId,
        status: "SUCCESS",
        finalOutput: output,
      });

      if (args.workflowExecutionId) {
        await ctx.runMutation(internal.scheduler.completeAgentExecution, {
          executionId: args.workflowExecutionId,
          agentRunId: runId,
          success: true,
          output,
        });
      }

      return { output, runId };
    } catch (error: unknown) {
      const errorMessage = normalizeAiRuntimeError(error, "Triggered agent execution failed.").error;
      if (runId) {
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "FAILED",
          error: errorMessage,
        });
      }
      if (args.workflowExecutionId && runId) {
        await ctx.runMutation(internal.scheduler.completeAgentExecution, {
          executionId: args.workflowExecutionId,
          agentRunId: runId,
          success: false,
          output: errorMessage,
        });
      }
      throw error;
    }
  },
});

export const resumeApprovedToolCall = internalAction({
  args: {
    approvalId: v.id("agentRunApprovals"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.agentRuns.getApprovalResumeContextInternal, {
      approvalId: args.approvalId,
    });
    if (!context?.approval || !context.run || !context.toolCall) {
      throw new Error("Approval resume context not found.");
    }
    if (context.approval.status !== "APPROVED") {
      throw new Error("Approval has not been approved.");
    }
    if (context.toolCall.status !== "PENDING") {
      throw new Error("Approved tool call is not pending execution.");
    }

    let parsedArgs: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(context.toolCall.argumentsJson) as unknown;
      parsedArgs = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      parsedArgs = {};
    }

    let resultPayload;
    let finalOutput: string;
    let status: "SUCCESS" | "FAILED" = "FAILED";
    let error: string | undefined;

    if (context.toolCall.handlerMapping === "knowledge.search") {
      const query = getStringToolArg(parsedArgs, "query") || context.run.objective;
      const limit = getNumberToolArg(parsedArgs, "limit");
      const result = await ctx.runQuery(internal.aiToolReadTools.searchKnowledge, {
        query,
        agentId: context.approval.agentId,
        companyId: context.approval.companyId,
        limit,
      });
      status = "SUCCESS";
      resultPayload = buildToolResultPayload({
        status: "success",
        data: result,
      });
      finalOutput = `Approved tool call completed: ${context.toolCall.normalizedToolName}.`;
    } else if (context.toolCall.handlerMapping === "company.overview.update") {
      if (!context.approval.companyId) {
        throw new Error("Company overview updates require a tenant context.");
      }
      if (!context.approval.reviewedBy) {
        throw new Error("Company overview updates require an approving administrator.");
      }
      const overview = getStringToolArg(parsedArgs, "overview");
      const idempotencyKey = getOptionalStringToolArg(parsedArgs, "idempotencyKey");
      const result = await ctx.runMutation(internal.aiToolWriteTools.updateCompanyOverview, {
        companyId: context.approval.companyId,
        actorId: context.approval.reviewedBy,
        overview,
        runId: context.approval.runId,
        toolCallId: context.toolCall._id,
        idempotencyKey,
      });
      status = "SUCCESS";
      resultPayload = buildToolResultPayload({
        status: "success",
        data: result,
      });
      finalOutput = result.changed
        ? "Approved company overview update completed."
        : "Approved company overview update completed with no changes.";
    } else {
      error = "Unknown or unimplemented tool handler mapping.";
      resultPayload = buildToolResultPayload({
        status: "error",
        error,
      });
      finalOutput = `Approved tool call failed: ${error}`;
    }

    const completion = await ctx.runMutation(internal.agentRuns.completeApprovalResumeInternal, {
      approvalId: args.approvalId,
      status,
      resultJson: JSON.stringify(resultPayload),
      finalOutput,
      error,
    });

    if (completion.threadId) {
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        threadId: completion.threadId,
        content: completion.finalOutput,
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
