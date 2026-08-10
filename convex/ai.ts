"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { Type } from "@google/genai";
import { internal } from "./_generated/api";
import { requireActionAdmin, requireActionUser } from "./actionAuth";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import type { Id } from "./_generated/dataModel";
import type { AiContentPart } from "./aiRuntimeTypes";
import {
  buildAssistantSystemInstruction,
  buildUntrustedConversationHistory,
  buildUntrustedKnowledgeContext,
  rankAssistantKnowledgeMatches,
  selectKnowledgeChunksWithinBudget,
} from "./aiPromptAssembly";
import { evaluateAssistantSafety } from "./aiSafetyPolicy";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import { shouldFlushStreamedText } from "./streamingService";
import { adminAction, tenantAction } from "./tenantFunctions";
import { buildCompanyMemoryEvidence, buildCompanyRuntimeEvidence } from "./utils/messageEvidence";

const CHAT_CONTENT_MAX_LENGTH = 10000;
const TRANSCRIPTION_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const TRANSCRIPTION_RATE_LIMIT_PER_MINUTE = 6;
const NODE_CONFIG_PROMPT_MAX_LENGTH = 4000;
const NODE_CONFIG_NODE_TYPE_MAX_LENGTH = 80;
const NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT = 100;
const NODE_CONFIG_NODE_FIELD_MAX_LENGTH = 120;
const NODE_CONFIG_CONTEXT_MAX_LENGTH = 12000;
const NODE_CONFIG_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const NODE_CONFIG_RATE_LIMIT_MAX_REQUESTS = 12;
const AI_ACTION_RATE_LIMIT_WINDOW_MS = 60 * 1000;

type RuntimeCompanyMemory = {
  memoryId: Id<"companyMemories">;
  title: string;
  content: string;
  applyMode: "ALWAYS" | "WHEN_RELEVANT";
  confidence: number;
  score: number;
};

const allowedTranscriptionMimeTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function getBase64DecodedByteLength(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function assertValidTranscriptionPayload(args: { audioBase64: string; mimeType: string }) {
  const mimeType = normalizeMimeType(args.mimeType);
  const audioBase64 = args.audioBase64.replace(/\s/g, "");
  if (!allowedTranscriptionMimeTypes.has(mimeType)) {
    throw new Error("Unsupported audio MIME type.");
  }

  if (!audioBase64) {
    throw new Error("Audio payload is required.");
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(audioBase64)) {
    throw new Error("Invalid audio payload encoding.");
  }

  if (getBase64DecodedByteLength(audioBase64) > TRANSCRIPTION_AUDIO_MAX_BYTES) {
    throw new Error("Audio payload cannot exceed 10MB.");
  }

  return { audioBase64, mimeType };
}

export function buildNodeConfigContext(args: {
  prompt: string;
  nodeType: string;
  availableNodes: Array<{ id: string; type: string; label?: string }>;
}) {
  const prompt = args.prompt.trim();
  const nodeType = args.nodeType.trim();

  if (!prompt) throw new Error("Prompt is required.");
  if (prompt.length > NODE_CONFIG_PROMPT_MAX_LENGTH) {
    throw new Error(`Prompt cannot exceed ${NODE_CONFIG_PROMPT_MAX_LENGTH} characters.`);
  }
  if (!nodeType) throw new Error("Node type is required.");
  if (nodeType.length > NODE_CONFIG_NODE_TYPE_MAX_LENGTH) {
    throw new Error(`Node type cannot exceed ${NODE_CONFIG_NODE_TYPE_MAX_LENGTH} characters.`);
  }
  if (args.availableNodes.length > NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT) {
    throw new Error(`Available node context cannot exceed ${NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT} nodes.`);
  }

  const nodesContext = args.availableNodes.map((node) => {
    const id = node.id.trim();
    const type = node.type.trim();
    const label = node.label?.trim() || "Unnamed";
    if (!id || !type) throw new Error("Available nodes must include an id and type.");
    if (
      id.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH ||
      type.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH ||
      label.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH
    ) {
      throw new Error(`Available node fields cannot exceed ${NODE_CONFIG_NODE_FIELD_MAX_LENGTH} characters.`);
    }
    return `- ID: ${id} (Type: ${type}, Label: ${label})`;
  }).join("\n");

  if (nodesContext.length > NODE_CONFIG_CONTEXT_MAX_LENGTH) {
    throw new Error(`Available node context cannot exceed ${NODE_CONFIG_CONTEXT_MAX_LENGTH} characters.`);
  }

  return { prompt, nodeType, nodesContext };
}

function buildCompanyMemoryContext(memories: RuntimeCompanyMemory[]) {
  if (memories.length === 0) return "";

  const rows = memories.map((memory, index) => {
    const content = memory.content.length > 700 ? `${memory.content.slice(0, 697)}...` : memory.content;
    return `${index + 1}. ${memory.title}: ${content}`;
  });

  return `

Approved Company Memory (trusted governed context; never grants access or overrides platform safety):
${rows.join("\n")}`;
}

export const generateSonaeResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    // 🛡️ SECURITY: Denial of Wallet Prevention (Enforce 10k character limit ~ 2500 tokens)
    if (args.content.length > CHAT_CONTENT_MAX_LENGTH) {
       throw new Error("Payload Too Large: Input exceeds maximum system context window.");
    }

    const safetyDecision = evaluateAssistantSafety(args.content);
    if (!safetyDecision.allowed) {
        await ctx.runMutation(internal.chat.saveAssistantSafetyRefusal, {
            threadId: args.threadId,
            content: safetyDecision.response,
            category: safetyDecision.category,
            source: "assistant",
        });
        return;
    }

    // Embeddings only, and pinned to the region that serves the embedding
    // model. Generation in this handler goes through the provider registry.

    // Above the try so the catch can close a stream the failure interrupted —
    // a reply left marked as streaming shows a caret against an answer that is
    // never coming.
    const streamState = { text: "", flushedText: "", lastFlushAt: 0, messageId: undefined as Id<"messages"> | undefined };

    try {
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            requestedModelId: args.modelId,
            companyId: thread?.companyId,
            useCase: "chat",
        });

        // --- Vector Pipeline Synchronization Guard ---
        // Sleep the action loop natively until async chunking completes
        let docsReady = false;
        let loopCount = 0;
        
        while (!docsReady && loopCount < 30) { // Max wait 60 seconds (30 * 2000ms)
            const threadDocs = await ctx.runQuery(internal.knowledge.getThreadDocumentsInternal, { threadId: args.threadId });
            const pendingDocs = threadDocs.filter((d) => d.status === "processing" || d.status === "pending");
            
            if (pendingDocs.length === 0) {
               docsReady = true;
               break;
            }
            
            loopCount++;
            await new Promise(r => setTimeout(r, 2000));
        }

        // Fetch up to 20 previous messages to pass as context
        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });
        
        const conversationHistory = buildUntrustedConversationHistory({
            messages,
            maxMessages: 20,
        });

        // Dynamically extract the live Administrator protocol rulebook
        const [customPrompt, customRules, company, companySkills, companyMemories] = await Promise.all([
            ctx.runQuery(internal.system.getInternalSystemPrompt),
            ctx.runQuery(internal.aiRules.getActiveRulesInternal, { companyId: thread?.companyId }),
            thread?.companyId ? ctx.runQuery(internal.companies.getCompanyByIdInternal, { id: thread.companyId }) : Promise.resolve(null),
            thread?.companyId
                ? ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId: thread.companyId })
                : Promise.resolve(null),
            thread?.companyId
                ? ctx.runQuery(internal.companyMemories.getRuntimeMemoriesInternal, {
                    companyId: thread.companyId,
                    queryText: args.content,
                    limit: 5,
                })
                : Promise.resolve(null),
        ]);

        const alwaysMemories = companyMemories?.always ?? [];
        const relevantMemories = companyMemories?.relevant ?? [];

        const activeSystemInstruction = buildAssistantSystemInstruction({
            globalSystemPrompt: customPrompt,
            companySystemPrompt: company?.systemPrompt,
            activeRules: customRules ?? [],
            companySkills: companySkills?.skills ?? [],
            // Always memories are configuration, so they sit in the system
            // instruction; only the looked-up ones go in the per-message block.
            companyMemories: alwaysMemories,
        });

        const companyMemoryContext = buildCompanyMemoryContext(relevantMemories);
        const companyMemoryEvidenceJson = buildCompanyMemoryEvidence([...alwaysMemories, ...relevantMemories]);

        // --- RAG VECTOR SEARCH PIPELINE ---
        let ragContext = "";
        // Populated only when retrieval admits chunks, so an answer with no
        // grounding records none rather than recording what was merely available.
        let retrievedChunkIds: string[] = [];
        
        try {
            const queryVector = await embedRetrievalQuery(ctx, {
                query: args.content,
                companyId: thread?.companyId,
                operation: "assistantRagEmbedding",
            });

            if (queryVector) {
                // Multi-tier hybrid search (vector + keyword, fused per scope).
                const [companyChunks, globalChunks, threadChunks] = await Promise.all([
                    thread?.companyId
                      ? searchKnowledgeScope(ctx, {
                          queryVector,
                          queryText: args.content,
                          scope: { kind: "company", companyId: thread.companyId },
                          limit: 50,
                          priorCompanyId: thread.companyId,
                        })
                      : Promise.resolve([]),
                    searchKnowledgeScope(ctx, {
                        queryVector,
                        queryText: args.content,
                        scope: { kind: "global" },
                        limit: 50,
                        // Tenant-scoped evidence applies to global documents
                        // too: it is this company's experience of them.
                        priorCompanyId: thread?.companyId,
                    }),
                    searchKnowledgeScope(ctx, {
                        queryVector,
                        queryText: args.content,
                        scope: { kind: "thread", threadId: args.threadId },
                        limit: 50,
                        priorCompanyId: thread?.companyId,
                    }),
                ]);
                
                const allChunks = rankAssistantKnowledgeMatches({
                    globalMatches: globalChunks,
                    companyMatches: companyChunks,
                    threadMatches: threadChunks,
                });

                if (allChunks.length > 0) {
                    const MAX_RAG_CHARS = 32000;
                    // Files uploaded into this conversation are usually the whole
                    // reason the user is asking, so hold part of the budget for
                    // them rather than letting a large global knowledge base
                    // crowd them out on raw relevance.
                    const { chunkTexts, chunkIds } = await selectKnowledgeChunksWithinBudget({
                       ranked: allChunks,
                       maxChars: MAX_RAG_CHARS,
                       threadReserveRatio: 0.3,
                       loadChunk: (id) => ctx.runQuery(internal.knowledge.getChunkInternal, { id }),
                    });

                    if (chunkTexts.length > 0) {
                      // Which documents reached the model, recorded so a check can
                      // ask whether the answer was actually grounded in them.
                      retrievedChunkIds = chunkIds;
                      ragContext = buildUntrustedKnowledgeContext({
                        sourceLabel: "global, company, and thread-scoped knowledge",
                        chunks: chunkTexts,
                        maxChars: MAX_RAG_CHARS,
                      });
                    }
                }
            }
        } catch (e) {
            console.error("RAG pipeline failed to execute", e);
        }

        // Clean prompt construction (isolated from logic rules)
        let combinedPrompt = `${conversationHistory ? `${conversationHistory}\n` : ""}${companyMemoryContext ? `${companyMemoryContext}\n` : ""}

User Prompt: ${args.content}`;

        if (ragContext) {
            combinedPrompt += ragContext;
        }

        // --- Ad-hoc File Parsing for Chat Uploads ---
        const payloadContents: AiContentPart[] = [];
        
        if (args.fileIds && args.fileIds.length > 0) {
            for (const fileId of args.fileIds) {
                try {
                    const fileUrl = await ctx.storage.getUrl(fileId);
                    if (fileUrl) {
                        const fileResponse = await fetch(fileUrl);
                        if (fileResponse.ok) {
                            const contentLength = fileResponse.headers.get("content-length");
                            if (contentLength && parseInt(contentLength, 10) > 5242880) { // 5MB
                                throw new Error(`File exceeds the maximum allowed size of 5MB for inline processing.`);
                            }
                            
                            const mimeType = fileResponse.headers.get("content-type") || "application/octet-stream";
                            const arrayBuffer = await fileResponse.arrayBuffer();
                            
                            if (arrayBuffer.byteLength > 5242880) { // 5MB fallback check
                                throw new Error(`File exceeds the maximum allowed size of 5MB for inline processing.`);
                            }
                            
                            const buffer = Buffer.from(arrayBuffer);
                            
                            payloadContents.push({
                                type: "inlineData",
                                data: buffer.toString('base64'),
                                mimeType: mimeType
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse attached file for Generation Context:", fileId, e);
                }
            }
        }
        
        // Push the main textual context
        payloadContents.push({ type: "text", text: combinedPrompt });

        // --- STREAMED GENERATION ---
        // The same flush discipline the agent runtime uses: accumulate text as
        // the provider produces it, write the partial reply at a bounded rate
        // (every subscribed client re-renders per write), and always finalize
        // so no reply is left showing a caret. Providers whose adapter cannot
        // stream simply never call onText, and the reply lands in one write at
        // the end exactly as before.
        const flushStream = async () => {
            const pendingChars = streamState.text.length - streamState.flushedText.length;
            const flushNow = Date.now();
            if (!shouldFlushStreamedText({
                pendingChars,
                msSinceLastFlush: flushNow - streamState.lastFlushAt,
                isFinal: false,
            })) return;

            if (streamState.messageId === undefined) {
                streamState.messageId = await ctx.runMutation(internal.chat.startStreamingAssistantMessage, {
                    threadId: args.threadId,
                    content: streamState.text,
                    modelUsed: modelConfig.modelId,
                    providerKey: modelConfig.providerKey,
                    providerModelId: modelConfig.providerModelId,
                });
            } else {
                await ctx.runMutation(internal.chat.appendStreamingAssistantMessage, {
                    messageId: streamState.messageId,
                    content: streamState.text,
                });
            }
            streamState.flushedText = streamState.text;
            streamState.lastFlushAt = flushNow;
        };

        const response = await generateTextWithResolvedModel({
            model: modelConfig,
            contents: payloadContents,
            systemInstruction: activeSystemInstruction,
            thinkingLevel: args.thinkingLevel,
            onText: async (fragment) => {
                streamState.text += fragment;
                await flushStream();
            },
        });

        const assistantReply = response.text || "I was unable to assemble a coherent analysis.";
        const companyRuntimeEvidenceJson = buildCompanyRuntimeEvidence({
            skillIds: (companySkills?.skills ?? []).map((skill) => skill.skillId),
            sourceIds: retrievedChunkIds,
        });

        // Finalize the streamed row, or fall back to the single write when no
        // flush ever happened (short answer, or a non-streaming provider).
        let messageId: Id<"messages">;
        if (streamState.messageId !== undefined) {
            await ctx.runMutation(internal.chat.finishStreamingAssistantMessage, {
                messageId: streamState.messageId,
                content: assistantReply,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                modelUsed: modelConfig.modelId,
                providerKey: modelConfig.providerKey,
                providerModelId: modelConfig.providerModelId,
                companyMemoryEvidenceJson,
                companyRuntimeEvidenceJson,
            });
            messageId = streamState.messageId;
        } else {
            messageId = await ctx.runMutation(internal.chat.saveAssistantMessage, {
                threadId: args.threadId,
                content: assistantReply,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                modelUsed: modelConfig.modelId,
                providerKey: modelConfig.providerKey,
                providerModelId: modelConfig.providerModelId,
                companyMemoryEvidenceJson,
                companyRuntimeEvidenceJson,
            });
        }

        // Both lists count as used: an always memory reached the model just as
        // surely as a looked-up one, and the screen's "uses" column would
        // otherwise read zero for exactly the memories that apply most.
        const usedMemories = [...alwaysMemories, ...relevantMemories];
        if (thread?.companyId && usedMemories.length > 0) {
            await ctx.runMutation(internal.companyMemories.recordRuntimeUsageInternal, {
                companyId: thread.companyId,
                threadId: args.threadId,
                messageId,
                queryText: args.content,
                memories: usedMemories.map((memory) => ({
                    memoryId: memory.memoryId,
                    score: memory.score,
                })),
            });
        }

    } catch (error) {
        console.error("AI Orchestrator Error:", normalizeAiRuntimeError(error, "Core assistant generation failed."));

        const failureNotice = "Sonae Core Offline: An error occurred communicating with the selected AI provider. Please try again shortly.";
        if (streamState.messageId !== undefined) {
            // The partial answer stays visible — the reader already saw it —
            // with the failure notice appended, and the caret stops.
            await ctx.runMutation(internal.chat.finishStreamingAssistantMessage, {
                messageId: streamState.messageId,
                content: `${streamState.text}\n\n${failureNotice}`,
            });
        } else {
            await ctx.runMutation(internal.chat.saveAssistantMessage, {
                threadId: args.threadId,
                content: failureNotice,
            });
        }
    }
  },
});

export const transcribeAudio = tenantAction({
  args: {
    audioBase64: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const { audioBase64, mimeType } = assertValidTranscriptionPayload(args);
    await ctx.runMutation(internal.aiActionRequests.reserve, {
      actorId: userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actionName: "transcribeAudio",
      windowMs: AI_ACTION_RATE_LIMIT_WINDOW_MS,
      maxRequests: TRANSCRIPTION_RATE_LIMIT_PER_MINUTE,
    });

    const ai = createVertexGenAIClient({ location: "us-central1" }); // Enforce central routing for stable multimodal models

    try {
        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            useCase: "transcription",
        });
        const providerModelId = getGoogleVertexProviderModelId(modelConfig, "audio transcription");
        
        const response = await generateVertexContentWithRetry(ai, {
            model: providerModelId,
            contents: [
                { text: "Transcribe the following audio exactly. Output ONLY the raw transcription text without any prefix, markdown, or commentary." },
                { inlineData: { mimeType, data: audioBase64 } }
            ]
        }, {
            operation: "transcribeAudio",
        });

        return response.text ? response.text.trim() : "";
    } catch (error) {
        console.error("AI Transcription Error:", normalizeAiRuntimeError(error, "Audio transcription failed."));
        throw new Error("Failed to transcribe audio stream properly.");
    }
  }
});

export const generateThreadTitle = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        companyId: thread?.companyId,
        useCase: "title",
      });
      
      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        contents: [{ type: "text", text: `User Message: "${args.content}"` }],
        systemInstruction: "You are a professional assistant. Generate a concise, 3-to-4 word description of the user's message. Use standard Title Case. Do not include quotes, periods, or other punctuation. Your output must ONLY be the title.",
        temperature: 0.2,
      });

      const title = response.text?.trim().replace(/^["']|["']$/g, '');
      if (title && title.length > 0) {
        await ctx.runMutation(internal.chat.renameThreadInternal, {
          threadId: args.threadId,
          title: title
        });
      }
    } catch (error) {
      console.error("Failed to generate thread title:", normalizeAiRuntimeError(error, "Thread title generation failed."));
    }
  }
});

export const generateNodeConfig = adminAction({
  args: {
    prompt: v.string(),
    nodeType: v.string(),
    availableNodes: v.array(v.object({
      id: v.string(),
      type: v.string(),
      label: v.optional(v.string()),
    }))
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const { prompt, nodeType, nodesContext } = buildNodeConfigContext(args);
    await ctx.runMutation(internal.aiActionRequests.reserve, {
      actorId: userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actionName: "generateNodeConfig",
      windowMs: NODE_CONFIG_RATE_LIMIT_WINDOW_MS,
      maxRequests: NODE_CONFIG_RATE_LIMIT_MAX_REQUESTS,
    });

    try {
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "workflow",
      });
      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        contents: [{ type: "text", text: `User Prompt: "${prompt}"` }],
        temperature: 0.1,
        systemInstruction: `You are Sonae's structural orchestration engineer. You configure backend JSON bindings and String templates for visual Workflow Builder nodes securely and reliably.
The user wants to configure an isolated logic node of type: ${nodeType}.

Available upstream node context in the graph (You MUST use these explicit IDs when mathematically binding variables):
---
${nodesContext}
---

Your job is to translate the user's plain-English intent into exact system payload configuration.
- To mathematically bind data from an upstream node into the mapping, you MUST use the EXACT bracket syntax: {{nodes.<UPSTREAM_NODE_ID>.output.<FIELD_NAME>}}
- NEVER hallucinate node IDs. Only use the IDs explicitly listed above.
- The 'mapping' object must be a valid JSON representation (stringify it) of the required input mapping payload for the current node. Generate reasonable keys (like "text", "summary_data", "table_id") based on the implied nodeType.
- CRITICAL DATABASE RULE: Never generate JSON keys that start with a dollar sign (e.g. "$in", "$eq", "$set"). Convex explicitly rejects '$' prefixes in document keys.
- The 'template' object is a raw string layout if the node expects a raw string payload. You can inject variables directly into the text (e.g. "We received: {{nodes...}}").
- If the nodeType is 'codeNode', the 'template' MUST be a data-shaping template, NOT executable code. This node performs {{...}} variable substitution only — there is no script interpreter, so any Javascript you emit would be returned verbatim as the node's output instead of running. Express the transform as a literal string or JSON structure containing {{nodes.<UPSTREAM_NODE_ID>.output.<FIELD_NAME>}} placeholders. Never emit statements, expressions, function definitions, or a return statement.
- If the nodeType is 'agentNode', you MUST fully configure the agent's identity using the agent* variables. Set 'agentAllowInternet' to true if the prompt implies searching or getting live/current info.`,
        // Plain JSON Schema rather than Vertex's `Schema` type — the same shape,
        // in the vocabulary every provider understands.
        jsonSchema: {
          type: "object",
          properties: {
            mapping: { type: "string", description: "A valid JSON string representing the exact JSON Data mapping to apply, usually containing mathematical {{nodes...}} variable injections." },
            template: { type: "string", description: "Raw block string layout/template, if applicable." },
            agentName: { type: "string", description: "A concise name for the agent (only if nodeType is agentNode)." },
            agentSystemPrompt: { type: "string", description: "The core system instructions/directives for the AI agent (only if nodeType is agentNode)." },
            agentInputFields: { type: "string", description: "Comma separated expected variables for the input schema, e.g. 'url, data' (only if nodeType is agentNode)." },
            agentOutputFields: { type: "string", description: "Comma separated expected variables for the output schema, e.g. 'summary, classification' (only if nodeType is agentNode)." },
            agentAllowInternet: { type: "boolean", description: "Set to true if the agent's task requires searching the live internet (only if nodeType is agentNode)." }
          },
          required: ["mapping", "template"]
        },
      });

      if (!response.text) {
          throw new Error("No payload mapped.");
      }
      
      const jsonStr = response.text;
      const parsed = JSON.parse(jsonStr);
      return parsed as { mapping: string, template: string, agentName?: string, agentSystemPrompt?: string, agentInputFields?: string, agentOutputFields?: string, agentAllowInternet?: boolean };
      
    } catch (error) {
      console.error("Failed to generate node configuration via AI provider:", normalizeAiRuntimeError(error, "Node configuration generation failed."));
      throw new Error("Generative Payload creation failed.");
    }
  }
});
