"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { tenantAction } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";

export const routeAgentIntent = tenantAction({
  args: {
    prompt: v.string(),
  },
  returns: governanceShapes.intentRouteShape,
  handler: async (ctx, args) => {
    // Authenticate routing dispatch
    const { user } = ctx;

    try {
        // Fetch pool of active agents available to this company
        const agents = await ctx.runQuery(internal.agents.getForCompanyInternal, { 
            companyId: user.companyId 
        });

        if (!agents || agents.length === 0) {
            return { matchedAgentId: null, confidence: 0 };
        }

        // Build the routing context
        let contextBlock = "Available Agents:\n\n";
        agents.forEach((agent: Doc<"agents">) => {
            contextBlock += `[ID: ${agent._id}]\nName: ${agent.name}\nDescription: ${agent.description || 'No description provided'}\nSystem Rules: ${agent.systemPrompt || 'None'}\n\n`;
        });

        // Plain JSON Schema rather than Vertex's `Schema` type. Routing runs on
        // every message, so it is the job most worth putting on a cheap model —
        // and it could not move to one while the request was written in one
        // provider's vocabulary.
        const responseSchema = {
            type: "object",
            properties: {
                matchedAgentId: {
                    type: "string",
                    description: "The ID of the custom Agent that perfectly matches the user's intent. Must map exactly to one of the IDs provided. If NO agent is a strong fit, return an empty string.",
                },
                confidence: {
                    type: "number",
                    description: "Confidence rating from 0.0 to 1.0 of the match. Return 0 if no agent matches.",
                }
            },
            required: ["matchedAgentId", "confidence"]
        };

        const routingPrompt = `
You are the platform's Intent Router. Your job is to read a user's prompt and determine if one of the custom specialized Agents should handle it instead of the global assistant.

${contextBlock}

User Prompt:
"${args.prompt}"

Evaluate if the User Prompt explicitly matches the distinct capability or system rules of any Agent listed above. 
Do not force a match. If the prompt is generic conversation (e.g., "Hello", "How does this work?", "What's 2+2"), or doesn't match a dedicated agent specialization, output an empty matchedAgentId.
Output your intent alignment as JSON.
        `;

        // Execute routing via system default model
        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            companyId: user.companyId,
            useCase: "router",
        });
        const response = await generateTextWithResolvedModel({
             model: modelConfig,
             contents: [{ type: "text", text: routingPrompt }],
             temperature: 0.1, // Near deterministic
             jsonSchema: responseSchema,
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
        // Fail-open: default to Hakken global assistant
        return { matchedAgentId: null, confidence: 0 };
    }
  },
});
