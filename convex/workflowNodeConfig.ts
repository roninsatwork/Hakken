"use node";

/**
 * The workflow builder's plain-English-to-node-config translator
 * (`generateNodeConfig`): Standard-mode admins describe what a node should
 * do, and this authors the `{{nodes.<ID>.output.<FIELD>}}` template JSON the
 * engine runs. Lives with the workflow modules, not the chat pipeline —
 * moved out of the old `convex/ai.ts` on 2026-08-21 (foundation-quality
 * plan, phase 3).
 */

import { adminAction } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import { appError } from "./utils/appError";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

const NODE_CONFIG_PROMPT_MAX_LENGTH = 4000;
const NODE_CONFIG_NODE_TYPE_MAX_LENGTH = 80;
const NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT = 100;
const NODE_CONFIG_NODE_FIELD_MAX_LENGTH = 120;
const NODE_CONFIG_CONTEXT_MAX_LENGTH = 12000;
const NODE_CONFIG_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const NODE_CONFIG_RATE_LIMIT_MAX_REQUESTS = 12;
export function buildNodeConfigContext(args: {
  prompt: string;
  nodeType: string;
  availableNodes: Array<{ id: string; type: string; label?: string }>;
}) {
  const prompt = args.prompt.trim();
  const nodeType = args.nodeType.trim();

  if (!prompt) throw appError("INVALID_INPUT", "Prompt is required.");
  if (prompt.length > NODE_CONFIG_PROMPT_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Prompt cannot exceed ${NODE_CONFIG_PROMPT_MAX_LENGTH} characters.`);
  }
  if (!nodeType) throw appError("INVALID_INPUT", "Node type is required.");
  if (nodeType.length > NODE_CONFIG_NODE_TYPE_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Node type cannot exceed ${NODE_CONFIG_NODE_TYPE_MAX_LENGTH} characters.`);
  }
  if (args.availableNodes.length > NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT) {
    throw appError("INVALID_INPUT", `Available node context cannot exceed ${NODE_CONFIG_AVAILABLE_NODES_MAX_COUNT} nodes.`);
  }

  const nodesContext = args.availableNodes.map((node) => {
    const id = node.id.trim();
    const type = node.type.trim();
    const label = node.label?.trim() || "Unnamed";
    if (!id || !type) throw appError("INVALID_INPUT", "Available nodes must include an id and type.");
    if (
      id.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH ||
      type.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH ||
      label.length > NODE_CONFIG_NODE_FIELD_MAX_LENGTH
    ) {
      throw appError("INVALID_INPUT", `Available node fields cannot exceed ${NODE_CONFIG_NODE_FIELD_MAX_LENGTH} characters.`);
    }
    return `- ID: ${id} (Type: ${type}, Label: ${label})`;
  }).join("\n");

  if (nodesContext.length > NODE_CONFIG_CONTEXT_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Available node context cannot exceed ${NODE_CONFIG_CONTEXT_MAX_LENGTH} characters.`);
  }

  return { prompt, nodeType, nodesContext };
}

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
  returns: governanceShapes.workflowNodeConfigShape,
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
        systemInstruction: `You are the platform's structural orchestration engineer. You configure backend JSON bindings and String templates for visual Workflow Builder nodes securely and reliably.
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
          throw appError("UPSTREAM_FAILURE", "No payload mapped.");
      }
      
      const jsonStr = response.text;
      const parsed = JSON.parse(jsonStr);
      return parsed as { mapping: string, template: string, agentName?: string, agentSystemPrompt?: string, agentInputFields?: string, agentOutputFields?: string, agentAllowInternet?: boolean };
      
    } catch (error) {
      console.error("Failed to generate node configuration via AI provider:", normalizeAiRuntimeError(error, "Node configuration generation failed."));
      throw appError("UPSTREAM_FAILURE", "Generative Payload creation failed.");
    }
  }
});


