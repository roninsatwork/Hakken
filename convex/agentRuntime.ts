"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { internal } from "./_generated/api";
import { parseDocuments } from "./utils/fileParser";

export const generateAgentResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    // Escaping Edge runtime limits. Using implicit Node env parsing.
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    
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
        // 1. Fetch Agent Identity & System Prompt
        const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
        if (!agent) throw new Error("Agent not found.");

        const systemInstruction = agent.systemPrompt && agent.systemPrompt.trim().length > 0 
           ? agent.systemPrompt 
           : "You are an autonomous Sonae Agent. Use available tools to fulfill user requests.";

        const targetModel = await ctx.runQuery(internal.aiModels.resolveModelForExecution, { 
           requestedModelId: agent.modelId 
        });

        // 2. Fetch Conversation History 
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        if (!thread) throw new Error("Thread context missing");

        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });

        // Map Sonae generic messages into expected Vertex AI Content arrays
        const conversationHistory: any[] = messages.slice(-20).map((msg: any) => {
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
                currentUserContent += `\n\n====================\n[ATTACHED DOCUMENTS FOR THIS PROMPT]\nThe user has provided the following temporary documents. You MUST refer to these when answering.\n${documentText}\n====================\n`;
            }
        }

        conversationHistory.push({
            role: "user",
            parts: [{ text: currentUserContent }]
        });

        // 3. Fetch Assigned Connectors (Tools)
        const agentTools = await ctx.runQuery(internal.agents.getAgentToolsInternal, { agentId: args.agentId });
        
        // Build the Tools Declaration block for @google/genai
        const dynamicTools: any[] = [];
        
        for (const junction of agentTools) {
             const toolDef = await ctx.runQuery(internal.aiTools.getToolInternal, { id: junction.toolId });
             const schemaStr = (toolDef as any)?.inputSchema;
             if (toolDef && schemaStr) {
                 try {
                     const parsedSchema = JSON.parse(schemaStr);
                     // Map JSON Schema to GenAI FunctionDeclaration
                     dynamicTools.push({
                         name: toolDef.handlerMapping.replace(/[^a-zA-Z0-9_]/g, "_"), // sanitize name
                         description: toolDef.description,
                         parameters: parsedSchema
                     });
                 } catch(e) {
                     console.error("Failed to parse tool schema for:", toolDef.name);
                 }
             }
        }

        // --- RAG VECTOR SEARCH PIPELINE (Agent Isolated) ---
        let ragContext = "";
        try {
            const userEmbeddingResp = await ai.models.embedContent({
                model: "text-embedding-004",
                contents: args.content
            });
            
            const queryVector = userEmbeddingResp.embeddings?.[0]?.values;
            
            if (queryVector && queryVector.length === 768) {
                const vectorMatches = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                    vector: queryVector as number[],
                    limit: 100, // Matching the maximum RAG boundary limit
                    filter: (q) => q.eq("agentId", args.agentId)
                });
                
                if (vectorMatches.length > 0) {
                    ragContext = "\n\n====================\n[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]\nBelow is raw context retrieved securely from your specific Agent Knowledge Base. You MUST act upon this data to answer the user's prompt. Be EXHAUSTIVE and list EVERY detail found here. DO NOT summarize broadly; extract specific bullet points and exact phrases.\n\n<context_data>\n";
                    for (const res of vectorMatches) {
                       const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                       if (chunk) {
                          ragContext += `---\n${chunk.text}\n`;
                       }
                    }
                    ragContext += "</context_data>\n====================\n";
                }
            }
        } catch (e) {
            console.error("Agent RAG pipeline failed to execute", e);
        }

        const finalSystemInstruction = systemInstruction;
        if (ragContext) {
             // Append to the final user message to prioritize context grounding over system instruction fading
             conversationHistory[conversationHistory.length - 1].parts[0].text += ragContext;
        }

        const genConfig: any = {
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
        let response = await ai.models.generateContent({
             model: targetModel,
             contents: conversationHistory,
             config: genConfig
        });

        // Did the model request a tool?
        if (response.functionCalls && response.functionCalls.length > 0) {
            const funcCall = response.functionCalls[0];
            console.log("Agent requested function call:", funcCall.name, funcCall.args);
            
            // Log Telemetry: Tool Dispatch
            if (args.agentId) {
               await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                   agentId: args.agentId,
                   threadId: args.threadId,
                   interactionType: `TOOL DISPATCH: ${funcCall.name}`,
                   promptContent: args.content,
                   responseContent: `{"functionCall": {"name": "${funcCall.name}", "args": ${JSON.stringify(funcCall.args)}}}`,
                   companyId: thread.companyId
               });
            }

            // *** TODO: Execute the actual back-end hook mapping here ***
            const mockToolResponse = { status: "success", data: "Mocked backend response payload from Sonae Integrations Hub" };

            // Inject the Function Call and Function Response into the conversation history
            conversationHistory.push({
                role: "model",
                parts: [{
                    functionCall: {
                        name: funcCall.name,
                        args: funcCall.args
                    }
                }]
            });
            
            conversationHistory.push({
                role: "function",
                parts: [{
                    functionResponse: {
                        name: funcCall.name,
                        response: { name: funcCall.name, content: mockToolResponse }
                    }
                }]
            });

            // Pass 2: Let the model synthesize the backend data into English
            response = await ai.models.generateContent({
                model: targetModel,
                contents: conversationHistory,
                config: genConfig
            });
        }

        // Final Extraction
        const assistantReply = response.text || "Execution completed with no readable text output.";

        const inTokens = response.usageMetadata?.promptTokenCount || 0;
        const outTokens = response.usageMetadata?.candidatesTokenCount || 0;
        
        // Calculate dynamic cost based on the exact model utilized
        const allModelsRaw = await ctx.runQuery(internal.aiModels.getAllModelsInternal, {});
        const modelMap = new Map((allModelsRaw as any[]).map(m => [m.modelId, m]));
        const config = modelMap.get(targetModel);
        
        const inRate = config ? (inTokens > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
        const outRate = config ? (config.outputResponseCost || 0) : 0;
        const calculatedCost = (inTokens / 1000000) * inRate + (outTokens / 1000000) * outRate;

        // Write response back to DB
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: assistantReply,
            inputTokens: inTokens,
            outputTokens: outTokens,
            modelUsed: targetModel
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
                    modelUsed: targetModel,
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    costGBP: calculatedCost,
                    status: "SUCCESS"
                });
            }
        }

    } catch (error: any) {
        console.error("Agent Engine Error:", error);
        
        if (args.agentId) {
             await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                 agentId: args.agentId,
                 threadId: args.threadId,
                 interactionType: "ERROR",
                 promptContent: args.content,
                 responseContent: error.message || "Unknown Engine Exception"
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
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    
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

    const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
    if (!agent) throw new Error("Agent not found.");

    const targetModel = await ctx.runQuery(internal.aiModels.resolveModelForExecution, { 
       requestedModelId: agent.modelId 
    });

    const systemInstruction = agent.systemPrompt || "You are a specialized agent in a workflow.";
    
    const config: any = {
        systemInstruction: systemInstruction,
        temperature: 0.1,
    };

    if (agent.outputSchema) {
        try {
            config.responseMimeType = "application/json";
            config.responseSchema = JSON.parse(agent.outputSchema);
        } catch (e) {
            console.error("Failed to parse output schema", e);
        }
    }

    const response = await ai.models.generateContent({
        model: targetModel,
        contents: `Input Data:\n${args.input}`,
        config: config
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
