"use node";

import { internalAction } from "./_generated/server";
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
    const ai = new GoogleGenAI({});
    
    // Default mapped model selections for Sonae UI
    let actualModelStr = "gemini-2.5-pro"; // Default to Thinking
    if (args.modelId === "fast") actualModelStr = "gemini-2.5-flash";
    if (args.modelId === "pro") actualModelStr = "gemini-3.1-pro-preview";
    
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

        const systemPrompt = `You are Sonae Assistant. You are a highly intelligent, premium AI embedded in the Sonae productivity dashboard.
You are concise, highly analytical, and maintain a starkly elegant tone. Do NOT use emojis.
Never hallucinate system capabilities you do not have. Answer formatting should use markdown for readability.

${messages.length > 0 ? memoryString : ""}

User Prompt: ${args.content}`;

        const response = await ai.models.generateContent({
            model: actualModelStr, // Dynamically use Sonae user preference
            contents: systemPrompt
        });

        const assistantReply = response.text || "I was unable to assemble a coherent analysis.";

        // Write response back to DB via an internal mutation
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: assistantReply
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
