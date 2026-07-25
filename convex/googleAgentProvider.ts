"use node";

import type { Content, FunctionDeclaration, GenerateContentConfig, Tool } from "@google/genai";
import { GOOGLE_VERTEX_PROVIDER_KEY, getGoogleVertexProviderModelId } from "./aiModelService";
import {
  createVertexGenAIClient,
  createVertexPromptCache,
  deleteVertexPromptCache,
  streamVertexContentWithRetry,
} from "./vertexProviderService";
import type {
  AgentProviderAdapter,
  AgentStreamOptions,
  AgentTurnRequest,
  AgentTurnResponse,
  PromptCacheRequest,
} from "./agentProviderTypes";

/**
 * Google Vertex behind the neutral agent-provider contract.
 *
 * Deliberately thin. The runtime's transcript is already stored in Google's
 * `Content` shape, so this adapter mostly assembles the request and normalises
 * the response — no translation is needed in this direction.
 *
 * Keeping it a pass-through over `streamVertexContentWithRetry` matters beyond
 * tidiness: the runtime's existing behavioural tests mock that function, so
 * routing the loop through this adapter leaves them exercising exactly the same
 * path. Their passing unchanged is the evidence that introducing the seam
 * changed no behaviour.
 */
export function createGoogleAgentProvider(): AgentProviderAdapter {
  return {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,

    async streamTurn(request: AgentTurnRequest, options: AgentStreamOptions): Promise<AgentTurnResponse> {
      const ai = createVertexGenAIClient();
      const targetModel = getGoogleVertexProviderModelId(request.model, "agent tool runtime");

      const declarations = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parametersJsonSchema,
      })) as FunctionDeclaration[];
      const providerTools: Tool[] | undefined = declarations.length > 0
        ? [{ functionDeclarations: declarations }]
        : undefined;

      // With a cache in play the prefix lives provider-side, so the request
      // carries only what follows it and the instruction and tools come from
      // the cache — repeating them alongside `cachedContent` is rejected.
      const usingCache = Boolean(request.cacheName) && (request.cachedPrefixTurns ?? 0) > 0;
      const contents = usingCache
        ? request.turns.slice(request.cachedPrefixTurns) as Content[]
        : request.turns as Content[];

      const config: GenerateContentConfig = usingCache
        ? { temperature: request.temperature, cachedContent: request.cacheName }
        : {
          systemInstruction: request.systemInstruction,
          temperature: request.temperature,
          ...(providerTools ? { tools: providerTools } : {}),
        };

      const response = await streamVertexContentWithRetry(ai, {
        model: targetModel,
        contents,
        config,
      }, {
        operation: options.operation,
        onText: options.onText,
      });

      const toolCalls = (response.functionCalls ?? []).map((call) => ({
        name: call.name ?? "",
        args: (call.args ?? {}) as Record<string, unknown>,
      }));

      return {
        text: response.text ?? "",
        toolCalls,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        cachedInputTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
        // Google reports a finish reason per candidate rather than a single
        // stop reason. The loop's own decision is "did it ask for tools?",
        // which the presence of function calls answers directly.
        outcome: toolCalls.length > 0 ? "RUN_TOOLS" : "COMPLETE",
      };
    },

    async createPromptCache(request: PromptCacheRequest) {
      const declarations = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parametersJsonSchema,
      })) as FunctionDeclaration[];

      return await createVertexPromptCache(createVertexGenAIClient(), {
        model: getGoogleVertexProviderModelId(request.model, "agent prompt cache"),
        contents: request.turns as Content[],
        systemInstruction: request.systemInstruction,
        tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
        ttlSeconds: request.ttlSeconds,
        displayName: request.label,
      });
    },

    async releasePromptCache(name: string) {
      await deleteVertexPromptCache(createVertexGenAIClient(), name);
    },
  };
}
