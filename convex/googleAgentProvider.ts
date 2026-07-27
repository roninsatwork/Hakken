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
  AgentReasoningEffort,
  AgentStreamOptions,
  AgentTurnRequest,
  AgentTurnResponse,
  PromptCacheRequest,
} from "./agentProviderTypes";

/**
 * The agent's three levels in Vertex's own terms.
 *
 * Vertex names a fourth, `MINIMAL`, which the agent never offers — the screen's
 * lowest setting is Low, and silently running below it would be a different
 * answer than the one asked for.
 */
function toGoogleThinkingLevel(effort: AgentReasoningEffort) {
  return effort;
}

/**
 * What Vertex is asked for beyond the transcript, built where it can be read.
 *
 * Extracted from the adapter body so the request this builds can be asserted
 * directly. The alternative was a test that stands up a Vertex client, which is
 * why neither of the two settings assembled here had a test before.
 */
export function buildGoogleAgentConfig(request: {
  systemInstruction: string;
  temperature: number;
  tools?: Tool[];
  reasoningEffort?: AgentReasoningEffort;
  webSearch?: boolean;
  responseJsonSchema?: Record<string, unknown>;
  cacheName?: string;
  usingCache: boolean;
}): GenerateContentConfig {
  // Grounding is a provider-side tool, so it joins the function declarations
  // rather than replacing them: an agent can search and still call its own
  // tools in the same turn.
  const tools: Tool[] = [
    ...(request.tools ?? []),
    ...(request.webSearch ? [{ googleSearch: {} } as Tool] : []),
  ];
  const thinking = request.reasoningEffort
    ? { thinkingConfig: { thinkingLevel: toGoogleThinkingLevel(request.reasoningEffort) } }
    : {};
  // `responseJsonSchema` is the standard-JSON-Schema field, which is why the
  // builder's capitalised spelling never worked here.
  const structured = request.responseJsonSchema
    ? { responseMimeType: "application/json", responseJsonSchema: request.responseJsonSchema }
    : {};

  // With a cache in play the prefix lives provider-side, so the instruction and
  // tools come from the cache — repeating them alongside `cachedContent` is
  // rejected. Thinking is a per-request setting, not part of the cached prefix,
  // so it still applies.
  if (request.usingCache) {
    return {
      temperature: request.temperature,
      cachedContent: request.cacheName,
      ...thinking,
      ...structured,
    } as GenerateContentConfig;
  }
  return {
    systemInstruction: request.systemInstruction,
    temperature: request.temperature,
    ...(tools.length > 0 ? { tools } : {}),
    ...thinking,
    ...structured,
  } as GenerateContentConfig;
}

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

      const usingCache = Boolean(request.cacheName) && (request.cachedPrefixTurns ?? 0) > 0;
      const contents = usingCache
        ? request.turns.slice(request.cachedPrefixTurns) as Content[]
        : request.turns as Content[];

      const config = buildGoogleAgentConfig({
        systemInstruction: request.systemInstruction,
        temperature: request.temperature,
        tools: providerTools,
        reasoningEffort: request.reasoningEffort,
        webSearch: request.webSearch,
        responseJsonSchema: request.responseJsonSchema,
        cacheName: request.cacheName,
        usingCache,
      });

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
