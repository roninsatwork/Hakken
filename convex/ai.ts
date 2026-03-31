"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { api, internal } from "./_generated/api";

export const generateSonaeResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()), // Takes 'fast', 'thinking', or 'pro'
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
    
    // Default mapped model selections for Sonae UI
    let actualModelStr = "gemini-3.1-pro-preview"; // Default to Thinking
    let generationConfig: any = { 
        thinkingConfig: { thinkingLevel: "MEDIUM" } 
    };
    
    if (args.modelId === "fast") {
        actualModelStr = "gemini-3.1-flash-lite-preview";
        generationConfig = {}; // Flash models generally skip deep reasoning levels
    }
    if (args.modelId === "pro") {
        actualModelStr = "gemini-3.1-pro-preview";
        generationConfig = {
            thinkingConfig: { thinkingLevel: "HIGH" }
        };
    }
    
    try {
        // Fetch up to 20 previous messages to pass as context
        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });
        
        // Reconstruct conversation history (simplified for text-only currently)
        let memoryString = "Previous Conversation History:\n";
        messages.slice(-10).forEach((msg: any) => { // Grab last 10 messages for token efficiency
            memoryString += `\n[${msg.role.toUpperCase()}]: ${msg.content}`;
        });

        // Dynamically extract the live Administrator protocol rulebook
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        const [customPrompt, customRules] = await Promise.all([
            ctx.runQuery(internal.system.getInternalSystemPrompt),
            ctx.runQuery(internal.aiRules.getActiveRulesInternal, { companyId: thread?.companyId })
        ]);
        
        // Failsafe string array if the database table runs empty or is corrupted
        const fallbackSystemPrompt = "You are Sonae Assistant. You are a highly intelligent, premium AI embedded in the Sonae productivity dashboard.\nYou are concise, highly analytical, and maintain a starkly elegant tone. Do NOT use emojis.\nNever hallucinate system capabilities you do not have. Answer formatting should use markdown for readability.";
        
        let activeSystemInstruction = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : fallbackSystemPrompt;

        // Compile explicit logic branches if any are flagged active in the DB
        if (customRules && customRules.length > 0) {
            const compiledRules = customRules.map((r: any) => `[PRIORITY: ${r.priority}]\nIF USER ASKS OR MENTIONS: ${r.trigger}\nTHEN YOU MUST: ${r.instruction}`).join("\n\n---\n\n");
            activeSystemInstruction += `\n\n====================\nCRITICAL BEHAVIORAL OVERRIDES (STRICTLY OBEY THE FOLLOWING RULES WHEN REGIONALLY APPLICABLE):\n\n${compiledRules}`;
        }

        // --- RAG VECTOR SEARCH PIPELINE ---
        let ragContext = "";
        if (thread?.companyId) {
            try {
                // We reuse the existing `ai` client which is initialized above
                const userEmbeddingResp = await ai.models.embedContent({
                    model: "text-embedding-004",
                    contents: args.content
                });
                
                const queryVector = userEmbeddingResp.embeddings?.[0]?.values;
                
                if (queryVector && queryVector.length === 768) {
                    const results = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
                        vector: queryVector as number[],
                        limit: 3,
                        filter: (q) => q.eq("companyId", thread.companyId!)
                    });
                    
                    if (results.length > 0) {
                        ragContext = "\n\n====================\nCOMPANY KNOWLEDGE BASE CONTEXT (USE THIS FACTUAL DATA TO INFORM YOUR ANSWER IF IT RELATES TO THE QUESTION):\n";
                        for (const res of results) {
                           const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                           if (chunk) {
                              ragContext += `\n[Context Fragment]: ${chunk.text}\n`;
                           }
                        }
                    }
                }
            } catch (e) {
                console.error("RAG pipeline failed to execute", e);
            }
        }

        if (ragContext) {
            activeSystemInstruction += ragContext;
        }

        // Clean prompt construction (isolated from logic rules)
        const combinedPrompt = `${messages.length > 0 ? memoryString : ""}

User Prompt: ${args.content}`;

        // Dynamically inject rules into generation architecture
        generationConfig.systemInstruction = activeSystemInstruction;

        const response = await ai.models.generateContent({
            model: actualModelStr, // Dynamically use Sonae user preference
            contents: combinedPrompt,
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
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Most robust model publicly available in us-central1
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
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
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
