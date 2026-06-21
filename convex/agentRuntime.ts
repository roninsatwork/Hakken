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
  executeRegisteredTool,
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getApprovalRequiredMessage(toolName: string) {
    return `Approval required before continuing. The agent requested "${toolName}", and an administrator must approve or reject that tool call.`;
}

function getApprovedToolCompletionMessage(args: {
    handlerMapping: string;
    normalizedToolName: string;
    result: unknown;
}) {
    if (args.handlerMapping === "company.overview.update" && isRecord(args.result)) {
        return args.result.changed === false
            ? "Approved company overview update completed with no changes."
            : "Approved company overview update completed.";
    }

    return `Approved tool call completed: ${args.normalizedToolName}.`;
}

function buildHistoricalReplaySystemPrompt(args: {
    systemPrompt: string | null | undefined;
    rules: Array<{ name?: string; trigger?: string; instruction: string; priority?: number }>;
    skills?: Array<{ name: string; instruction: string; category?: string; riskLevel?: string }>;
}) {
    const configuredPrompt = args.systemPrompt || "";
    const skillInstruction = args.skills && args.skills.length > 0
        ? "\n\n====================\nHISTORICAL ENABLED AGENT SKILLS FROM THE REPLAYED VERSION SNAPSHOT:\n\n" + args.skills
            .map((skill) => {
                const metadata = [
                    skill.category ? `CATEGORY: ${skill.category}` : undefined,
                    skill.riskLevel ? `RISK: ${skill.riskLevel}` : undefined,
                ].filter(Boolean).join("\n");
                return `[SKILL: ${skill.name}]\n${metadata ? `${metadata}\n` : ""}${skill.instruction}`;
            })
            .join("\n\n---\n\n")
        : "";
    if (args.rules.length === 0) return `${configuredPrompt}${skillInstruction}`;

    const compiledRules = args.rules
        .map((rule) => {
            const label = rule.name ? `RULE: ${rule.name}` : "RULE";
            const priority = rule.priority !== undefined ? `PRIORITY: ${rule.priority}` : "PRIORITY: historical";
            const trigger = rule.trigger ? `WHEN: ${rule.trigger}` : "WHEN: historical replay context applies";
            return `[${label}]\n[${priority}]\n${trigger}\nTHEN: ${rule.instruction}`;
        })
        .join("\n\n---\n\n");

    return `${configuredPrompt}${skillInstruction}\n\n====================\nHISTORICAL ACTIVE AGENT RULES FROM THE REPLAYED VERSION SNAPSHOT:\n\n${compiledRules}`;
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

        // 2. Fetch Conversation History 
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        if (!thread) throw new Error("Thread context missing");
        const runtimeSkills = await ctx.runQuery(internal.agentSkills.getRuntimeSkillsInternal, {
            agentId: args.agentId,
            companyId: thread.companyId,
        });

        const systemInstruction = buildAgentSystemInstruction(agent.systemPrompt, runtimeSkills);

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
        if (runtimeSkills.length > 0) {
            preLoopStepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: thread.companyId,
                stepIndex: preLoopStepIndex,
                kind: "OBSERVE",
                status: "SUCCESS",
                input: args.content,
                output: JSON.stringify({
                    skills: runtimeSkills.map((skill) => ({
                        skillId: skill.skillId,
                        skillVersionId: skill.skillVersionId,
                        name: skill.name,
                        category: skill.category,
                        riskLevel: skill.riskLevel,
                        requiredToolMappings: skill.requiredToolMappings,
                    })),
                }),
            });
        }

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
            } else {
                try {
                    const result = await executeRegisteredTool({
                        ctx,
                        handlerMapping: toolMetadata.handlerMapping,
                        args: toolCall.args,
                        agentId: args.agentId,
                        companyId: thread.companyId,
                        userId: thread.userId,
                        runId,
                        fallbackQuery: args.content,
                    });
                    toolStatus = "SUCCESS";
                    toolResponsePayload = buildToolResultPayload({
                        status: "success",
                        data: result,
                    });
                } catch (error: unknown) {
                    toolError = getErrorMessage(error);
                    toolResponsePayload = buildToolFailureResult(error);
                }
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

      const replayExecutionContext = runId
        ? await ctx.runQuery(internal.agentRuns.getReplayExecutionContextInternal, { runId })
        : null;
      const requestedModelId = replayExecutionContext?.modelId
        ?? (agent.modelSelectionMode === "inherit" ? undefined : agent.modelId);
          const executionSystemPrompt = replayExecutionContext
        ? buildHistoricalReplaySystemPrompt({
            systemPrompt: replayExecutionContext.systemPrompt ?? agent.systemPrompt,
            rules: replayExecutionContext.rules,
            skills: replayExecutionContext.skills,
          })
        : agent.systemPrompt;
      const executionTemperature = replayExecutionContext?.temperature !== undefined
        ? replayExecutionContext.temperature
        : (agent.temperature !== undefined ? agent.temperature : 0.1);

      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        requestedModelId,
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
      let stepIndex = await ctx.runQuery(internal.agentRuns.getLatestStepIndexInternal, { runId });

      if (!safetyDecision.allowed) {
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex: stepIndex + 1,
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
      if (replayExecutionContext) {
        const replayExecutableTools = replayExecutionContext.tools.filter((tool) => tool.replayExecutable);
        const blockedReplayTools = replayExecutionContext.tools.filter((tool) => !tool.replayExecutable);
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({
            replayMode: replayExecutionContext.replayMode,
            replayOfRunId: replayExecutionContext.replayOfRunId,
            agentVersionId: replayExecutionContext.agentVersionId,
            versionNumber: replayExecutionContext.versionNumber,
            snapshotHash: replayExecutionContext.snapshotHash,
            promptHash: replayExecutionContext.promptHash,
            toolSetHash: replayExecutionContext.toolSetHash,
            memoryRevisionHash: replayExecutionContext.memoryRevisionHash,
            ruleSetHash: replayExecutionContext.ruleSetHash,
            modelConfigHash: replayExecutionContext.modelConfigHash,
            policyHash: replayExecutionContext.policyHash,
            hydrated: {
              prompt: replayExecutionContext.systemPrompt !== undefined,
              model: replayExecutionContext.modelId !== undefined,
              temperature: replayExecutionContext.temperature !== undefined,
              toolDeclarations: replayExecutionContext.tools.length > 0,
              toolExecution: false,
              memoryContents: replayExecutionContext.memoryContents.length > 0,
              rules: replayExecutionContext.rules.length > 0,
              skills: replayExecutionContext.skills.length > 0,
            },
            snapshotCounts: {
              tools: replayExecutionContext.toolCount,
              replayExecutableTools: replayExecutableTools.length,
              blockedReplayTools: blockedReplayTools.length,
              activeMemories: replayExecutionContext.memoryActiveCount,
              rules: replayExecutionContext.ruleCount,
              skills: replayExecutionContext.skillCount,
            },
            historicalTools: replayExecutionContext.tools.map((tool) => ({
              name: tool.name,
              handlerMapping: tool.handlerMapping,
              requiredRole: tool.requiredRole,
              sideEffectLevel: tool.sideEffectLevel,
              confirmationRequired: tool.confirmationRequired,
              isActive: tool.isActive,
              version: tool.version,
              replayExecutable: tool.replayExecutable,
              replayPolicy: tool.replayPolicy,
              replayBlockedReason: tool.replayBlockedReason,
              hasInputSchema: Boolean(tool.inputSchema),
            })),
          }),
        });
        if (replayExecutionContext.tools.length > 0) {
          stepIndex += 1;
          await ctx.runMutation(internal.agentRuns.appendStepInternal, {
            runId,
            agentId: args.agentId,
            companyId: args.companyId,
            stepIndex,
            kind: "TOOL_CALL",
            status: "SKIPPED",
            input: JSON.stringify({
              mode: "HISTORICAL_TOOL_REPLAY_TEST_MODE",
              requestedToolCount: replayExecutionContext.tools.length,
            }),
            output: JSON.stringify({
              executed: false,
              reason: "Historical tool execution is recorded as a dry-run policy check. Live tool calls are not replayed from snapshots.",
              testModeCandidates: replayExecutableTools.map((tool) => ({
                name: tool.name,
                handlerMapping: tool.handlerMapping,
                requiredRole: tool.requiredRole,
                sideEffectLevel: tool.sideEffectLevel,
                hasInputSchema: Boolean(tool.inputSchema),
              })),
              blockedTools: blockedReplayTools.map((tool) => ({
                name: tool.name,
                handlerMapping: tool.handlerMapping,
                sideEffectLevel: tool.sideEffectLevel,
                replayBlockedReason: tool.replayBlockedReason,
              })),
            }),
          });
          objectiveContent += buildUntrustedKnowledgeContext({
            sourceLabel: "historical replay tool declarations",
            chunks: replayExecutionContext.tools.map((tool) => {
              const status = tool.replayExecutable
                ? "read-only historical tool declaration available for reasoning only"
                : "historical tool execution blocked during replay";
              return [
                `tool: ${tool.name}`,
                `handlerMapping: ${tool.handlerMapping}`,
                tool.description ? `description: ${tool.description}` : undefined,
                tool.requiredRole ? `requiredRole: ${tool.requiredRole}` : undefined,
                tool.sideEffectLevel ? `sideEffectLevel: ${tool.sideEffectLevel}` : undefined,
                tool.version ? `version: ${tool.version}` : undefined,
                `replayStatus: ${status}`,
              ].filter(Boolean).join("\n");
            }),
            maxChars: 8000,
          });
        }
        if (replayExecutionContext.memoryContents.length > 0) {
          objectiveContent += buildUntrustedKnowledgeContext({
            sourceLabel: "historical replay memory snapshot",
            chunks: replayExecutionContext.memoryContents.map((memory) => {
              const metadata = [
                memory.kind ? `kind: ${memory.kind}` : undefined,
                memory.importance !== undefined ? `importance: ${memory.importance}` : undefined,
                memory.updatedAt !== undefined ? `updatedAt: ${memory.updatedAt}` : undefined,
              ].filter(Boolean).join(", ");
              return metadata ? `[${metadata}]\n${memory.content}` : memory.content;
            }),
            maxChars: 6000,
          });
        }
      }
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
      const runtimeSkills = replayExecutionContext
        ? []
        : await ctx.runQuery(internal.agentSkills.getRuntimeSkillsInternal, {
            agentId: args.agentId,
            companyId: args.companyId,
          });
      if (runtimeSkills.length > 0) {
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({
            skills: runtimeSkills.map((skill) => ({
              skillId: skill.skillId,
              skillVersionId: skill.skillVersionId,
              name: skill.name,
              category: skill.category,
              riskLevel: skill.riskLevel,
              requiredToolMappings: skill.requiredToolMappings,
            })),
          }),
        });
      }

      const response = await generateVertexContentWithRetry(ai, {
        model: targetModel,
        contents: [{
          role: "user",
          parts: [{ text: objectiveContent }],
        }] satisfies Content[],
        config: {
          systemInstruction: buildAgentSystemInstruction(executionSystemPrompt, runtimeSkills),
          temperature: executionTemperature,
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

    try {
      const result = await executeRegisteredTool({
        ctx,
        handlerMapping: context.toolCall.handlerMapping,
        args: parsedArgs,
        agentId: context.approval.agentId,
        companyId: context.approval.companyId,
        userId: context.approval.reviewedBy,
        runId: context.approval.runId,
        toolCallId: context.toolCall._id,
        fallbackQuery: context.run.objective,
      });
      status = "SUCCESS";
      resultPayload = buildToolResultPayload({
        status: "success",
        data: result,
      });
      finalOutput = getApprovedToolCompletionMessage({
        handlerMapping: context.toolCall.handlerMapping,
        normalizedToolName: context.toolCall.normalizedToolName,
        result,
      });
    } catch (toolError: unknown) {
      error = getErrorMessage(toolError);
      resultPayload = buildToolFailureResult(toolError);
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
