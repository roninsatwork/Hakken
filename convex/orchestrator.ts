"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const routeAgentIntent = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate routing dispatch
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.runQuery(internal.users.getUserInternal, { userId });
    if (!user) throw new Error("User not found in system");

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
        // Fetch pool of active agents available to this company
        const agents = await ctx.runQuery(internal.agents.getForCompanyInternal, { 
            companyId: user.companyId 
        });

        if (!agents || agents.length === 0) {
            return { matchedAgentId: null, confidence: 0 };
        }

        // Build the routing context
        let contextBlock = "Available Sonae Agents:\n\n";
        agents.forEach((agent: any) => {
            contextBlock += `[ID: ${agent._id}]\nName: ${agent.name}\nDescription: ${agent.description || 'No description provided'}\nSystem Rules: ${agent.systemPrompt || 'None'}\n\n`;
        });

        // Set up forcing schema for strict JSON parsing
        const responseSchema: Schema = {
            type: Type.OBJECT,
            properties: {
                matchedAgentId: {
                    type: Type.STRING,
                    description: "The ID of the custom Agent that perfectly matches the user's intent. Must map exactly to one of the IDs provided. If NO agent is a strong fit, return an empty string.",
                },
                confidence: {
                    type: Type.NUMBER,
                    description: "Confidence rating from 0.0 to 1.0 of the match. Return 0 if no agent matches.",
                }
            },
            required: ["matchedAgentId", "confidence"]
        };

        const routingPrompt = `
You are the Sonae Intent Router. Your job is to read a user's prompt and determine if one of the custom specialized Agents should handle it instead of the global assistant.

${contextBlock}

User Prompt:
"${args.prompt}"

Evaluate if the User Prompt explicitly matches the distinct capability or system rules of any Agent listed above. 
Do not force a match. If the prompt is generic conversation (e.g., "Hello", "How does this work?", "What's 2+2"), or doesn't match a dedicated agent specialization, output an empty matchedAgentId.
Output your intent alignment as JSON.
        `;

        // 3.1-flash-lite-preview excels at sub-500ms zero-shot routing 
        const response = await ai.models.generateContent({
             model: "gemini-3.1-flash-lite-preview",
             contents: routingPrompt,
             config: {
                 responseMimeType: "application/json",
                 responseSchema: responseSchema,
                 temperature: 0.1, // Near deterministic
             }
        });

        const jsonStr = response.text;
        if (!jsonStr) {
            return { matchedAgentId: null, confidence: 0 };
        }

        const parsed = JSON.parse(jsonStr);
        
        if (parsed.confidence > 0.65 && parsed.matchedAgentId && parsed.matchedAgentId.trim() !== '') {
            return { 
                matchedAgentId: parsed.matchedAgentId as string, 
                confidence: parsed.confidence 
            };
        }

        // Fallback to Global Assistant
        return { matchedAgentId: null, confidence: parsed.confidence || 0 };

    } catch (error) {
        console.error("Orchestrator Routing Error:", error);
        // Fail-open: default to Sonae global assistant
        return { matchedAgentId: null, confidence: 0 };
    }
  },
});
