"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

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
    if (args.content.length > 10000) {
       throw new Error("Payload Too Large: Input exceeds maximum system context window.");
    }

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
    
    // Direct mapping configuration
    let actualModelStr = args.modelId;
    
    const generationConfig: any = {};
    if (args.thinkingLevel && args.thinkingLevel !== "NONE") {
        generationConfig.thinkingConfig = { thinkingLevel: args.thinkingLevel };
    }

    actualModelStr = await ctx.runQuery(internal.aiModels.resolveModelForExecution, {
        requestedModelId: actualModelStr
    });
    
    try {
        // --- Vector Pipeline Synchronization Guard ---
        // Sleep the action loop natively until async chunking completes
        let docsReady = false;
        let loopCount = 0;
        
        while (!docsReady && loopCount < 30) { // Max wait 60 seconds (30 * 2000ms)
            const threadDocs = await ctx.runQuery(internal.knowledge.getThreadDocumentsInternal, { threadId: args.threadId });
            const pendingDocs = threadDocs.filter((d: any) => d.status === "processing" || d.status === "pending");
            
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
        
        // Reconstruct conversation history (simplified for text-only currently)
        let memoryString = "Previous Conversation History:\n";
        messages.slice(-20).forEach((msg: any) => { // Grab last 20 messages for deep contextual memory
            memoryString += `\n[${msg.role.toUpperCase()}]: ${msg.content}`;
        });

        // Dynamically extract the live Administrator protocol rulebook
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        const [customPrompt, customRules, company] = await Promise.all([
            ctx.runQuery(internal.system.getInternalSystemPrompt),
            ctx.runQuery(internal.aiRules.getActiveRulesInternal, { companyId: thread?.companyId }),
            thread?.companyId ? ctx.runQuery(internal.companies.getCompanyByIdInternal, { id: thread.companyId }) : Promise.resolve(null)
        ]);
        
        // Failsafe string array if the database table runs empty or is corrupted
        const fallbackSystemPrompt = "You are Sonae Assistant. You are a highly intelligent, premium AI embedded in the Sonae productivity dashboard.\nYou are concise, highly analytical, and maintain a starkly elegant tone. Do NOT use emojis.\nNever hallucinate system capabilities you do not have. Answer formatting should use markdown for readability.";
        
        let activeSystemInstruction = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : fallbackSystemPrompt;

        if (company && company.systemPrompt && company.systemPrompt.trim().length > 0) {
            activeSystemInstruction += `\n\n====================\nTENANT (COMPANY) SPECIFIC BEHAVIORAL INSTRUCTIONS:\n\n${company.systemPrompt}`;
        }

        // Compile explicit logic branches if any are flagged active in the DB
        if (customRules && customRules.length > 0) {
            const compiledRules = customRules.map((r: any) => `[PRIORITY: ${r.priority}]\nIF USER ASKS OR MENTIONS: ${r.trigger}\nTHEN YOU MUST: ${r.instruction}`).join("\n\n---\n\n");
            activeSystemInstruction += `\n\n====================\nCRITICAL BEHAVIORAL OVERRIDES (STRICTLY OBEY THE FOLLOWING RULES WHEN REGIONALLY APPLICABLE):\n\n${compiledRules}`;
        }

        // --- RAG VECTOR SEARCH PIPELINE ---
        let ragContext = "";
        
        try {
            const userEmbeddingResp = await ai.models.embedContent({
                model: "text-embedding-004",
                contents: args.content
            });
            
            const queryVector = userEmbeddingResp.embeddings?.[0]?.values;
            
            if (queryVector && queryVector.length === 768) {
                // Execute multi-tier RAG search
                const [companyChunks, globalChunks, threadChunks] = await Promise.all([
                    thread?.companyId 
                      ? ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                          vector: queryVector as number[],
                          limit: 50,
                          filter: (q) => q.eq("companyId", thread.companyId!)
                      })
                      : Promise.resolve([]),
                    ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                        vector: queryVector as number[],
                        limit: 50,
                        filter: (q) => q.eq("isGlobal", true)
                    }),
                    ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                        vector: queryVector as number[],
                        limit: 50,
                        filter: (q) => q.eq("threadId", args.threadId)
                    })
                ]);
                
                const allChunks = [...globalChunks, ...companyChunks, ...threadChunks];
                
                if (allChunks.length > 0) {
                    ragContext = "\n\n====================\n[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]\nBelow is raw context retrieved from the global system and the company's private documents. You MUST use this data to answer the user's prompt. Be EXHAUSTIVE and list EVERY detail found here. DO NOT summarize broadly; extract specific bullet points and data.\n\n<context_data>\n";
                    for (const res of allChunks) {
                       const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                       if (chunk && !chunk.agentId) {
                          ragContext += `---\n${chunk.text}\n`;
                       }
                    }
                    ragContext += "</context_data>\n====================\n";
                }
            }
        } catch (e) {
            console.error("RAG pipeline failed to execute", e);
        }

        // Clean prompt construction (isolated from logic rules)
        let combinedPrompt = `${messages.length > 0 ? memoryString : ""}

User Prompt: ${args.content}`;

        if (ragContext) {
            combinedPrompt += ragContext;
        }

        // --- Ad-hoc File Parsing for Chat Uploads ---
        const payloadContents: any[] = [];
        
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
                                inlineData: {
                                    data: buffer.toString('base64'),
                                    mimeType: mimeType
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse attached file for Generation Context:", fileId, e);
                }
            }
        }
        
        // Push the main textual context
        payloadContents.push(combinedPrompt);

        // Dynamically inject rules into generation architecture
        generationConfig.systemInstruction = activeSystemInstruction;

        const response = await ai.models.generateContent({
            model: actualModelStr, // Dynamically use Sonae user preference
            contents: payloadContents,
            config: generationConfig
        });

        const assistantReply = response.text || "I was unable to assemble a coherent analysis.";
        const telemetry = response.usageMetadata;

        // Write response back to DB via an internal mutation alongside the exact financial traces
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: assistantReply,
            inputTokens: telemetry?.promptTokenCount,
            outputTokens: telemetry?.candidatesTokenCount,
            modelUsed: actualModelStr
        });

    } catch (error) {
        console.error("Vertex AI Orchestrator Error:", error);
        
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: "Sonae Core Offline: An error occurred communicating with the Google Cloud intelligence cluster. Check Vertex AI status."
        });
    }
  },
});

export const transcribeAudio = action({
  args: {
    audioBase64: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
    const location = "us-central1"; // Enforce central routing for stable multimodal models
    
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
        const defaultModel = await ctx.runQuery(internal.aiModels.resolveModelForExecution, {});
        
        const response = await ai.models.generateContent({
            model: defaultModel,
            contents: [
                { text: "Transcribe the following audio exactly. Output ONLY the raw transcription text without any prefix, markdown, or commentary." },
                { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } }
            ]
        });

        return response.text ? response.text.trim() : "";
    } catch (error) {
        console.error("Vertex AI Transcription Error:", error);
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
      const defaultModel = await ctx.runQuery(internal.aiModels.resolveModelForExecution, {});
      
      const response = await ai.models.generateContent({
        model: defaultModel,
        contents: `User Message: "${args.content}"`,
        config: {
          systemInstruction: "You are a professional assistant. Generate a concise, 3-to-4 word description of the user's message. Use standard Title Case. Do not include quotes, periods, or other punctuation. Your output must ONLY be the title.",
          temperature: 0.2,
        }
      });

      const title = response.text?.trim().replace(/^["']|["']$/g, '');
      if (title && title.length > 0) {
        await ctx.runMutation(internal.chat.renameThreadInternal, {
          threadId: args.threadId,
          title: title
        });
      }
    } catch (error) {
      console.error("Failed to generate thread title:", error);
    }
  }
});

export const generateNodeConfig = action({
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.runQuery(internal.users.getUserInternal, { userId });
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) {
        throw new Error("Unauthorized: Only administrators can configure workflow nodes.");
    }

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
      const defaultModel = await ctx.runQuery(internal.aiModels.resolveModelForExecution, {});
      
      const nodesContext = args.availableNodes.map(n => `- ID: ${n.id} (Type: ${n.type}, Label: ${n.label || 'Unnamed'})`).join("\n");
      
      const response = await ai.models.generateContent({
        model: defaultModel,
        contents: `User Prompt: "${args.prompt}"`,
        config: {
          systemInstruction: `You are Sonae's structural orchestration engineer. You configure backend JSON bindings and String templates for visual Workflow Builder nodes securely and reliably.
The user wants to configure an isolated logic node of type: ${args.nodeType}.

Available upstream node context in the graph (You MUST use these explicit IDs when mathematically binding variables):
---
${nodesContext}
---

Your job is to translate the user's plain-English intent into exact system payload configuration.
- To mathematically bind data from an upstream node into the mapping, you MUST use the EXACT bracket syntax: {{nodes.<UPSTREAM_NODE_ID>.output.<FIELD_NAME>}}
- NEVER hallucinate node IDs. Only use the IDs explicitly listed above.
- The 'mapping' object must be a valid JSON representation (stringify it) of the required input mapping payload for the current node. Generate reasonable keys (like "text", "summary_data", "table_id") based on the implied nodeType.
- The 'template' object is a raw string layout if the node expects a raw string payload. You can inject variables directly into the text (e.g. "We received: {{nodes...}}").
- If the required mapping or template is empty based on intent, return an empty string.`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mapping: { type: Type.STRING, description: "A valid JSON string representing the exact JSON Data mapping to apply, usually containing mathematical {{nodes...}} variable injections." },
              template: { type: Type.STRING, description: "Raw block string layout/template, if applicable." }
            },
            required: ["mapping", "template"]
          }
        }
      });

      if (!response.text) {
          throw new Error("No payload mapped.");
      }
      
      const jsonStr = response.text;
      const parsed = JSON.parse(jsonStr);
      return parsed as { mapping: string, template: string };
      
    } catch (error) {
      console.error("Failed to generate node configuration via Vertex AI:", error);
      throw new Error("Generative Payload creation failed.");
    }
  }
});
