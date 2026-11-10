"use node";

import { ThinkingLevel } from "@google/genai";
import type { GenerateContentConfig, Part } from "@google/genai";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
  streamVertexContentWithRetry,
  vertexModelRules,
  VERTEX_TEXT_CLIENT,
  type VertexModelRules,
} from "./vertexProviderService";
import { vertexUsage } from "./vertexUsage";

function toGoogleParts(contents: AiGenerationRequest["contents"]): Part[] {
  return contents.map((part) => {
    if (part.type === "text") {
      return { text: part.text };
    }

    return {
      inlineData: {
        mimeType: part.mimeType,
        data: part.data,
      },
    };
  });
}

/**
 * The thinking level asked for, in the SDK's terms, as this model takes it.
 *
 * Minimal becomes Low on a model that rejects Minimal (`vertexModelRules`):
 * the nearest level it will run, rather than a call that errors.
 */
export function parseGoogleThinkingLevel(value: string, rules: Pick<VertexModelRules, "takesMinimalThinking">): ThinkingLevel | undefined {
  switch (value) {
    case "MINIMAL":
      return rules.takesMinimalThinking ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
    case "LOW":
      return ThinkingLevel.LOW;
    case "MEDIUM":
      return ThinkingLevel.MEDIUM;
    case "HIGH":
      return ThinkingLevel.HIGH;
    default:
      return undefined;
  }
}

export function createGoogleProviderAdapter(args: { location?: string } = {}): AiProviderAdapter {
  return {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    async generateText(request: AiGenerationRequest): Promise<AiGenerationResponse> {
      const ai = createVertexGenAIClient({ ...VERTEX_TEXT_CLIENT, ...(args.location ? { location: args.location } : {}) });
      const config: GenerateContentConfig = {};
      const rules = vertexModelRules(request.model.providerModelId);

      if (request.systemInstruction) config.systemInstruction = request.systemInstruction;
      // Left off where the model ignores it, so a request never asks for more
      // than the model does.
      if (typeof request.temperature === "number" && rules.honoursTemperature) config.temperature = request.temperature;
      if (typeof request.maxOutputTokens === "number") config.maxOutputTokens = request.maxOutputTokens;
      if (request.thinkingLevel && request.thinkingLevel !== "NONE") {
        const thinkingLevel = parseGoogleThinkingLevel(request.thinkingLevel, rules);
        if (thinkingLevel) config.thinkingConfig = { thinkingLevel };
      }
      if (request.jsonSchema) {
        // Vertex takes JSON Schema directly here; the SDK's `Schema` type is a
        // typed view over the same shape, which is why the call sites that
        // built one by hand could be moved to plain schemas without changing
        // what the model receives.
        config.responseMimeType = "application/json";
        config.responseSchema = request.jsonSchema as GenerateContentConfig["responseSchema"];
      }

      const params = {
        model: request.model.providerModelId,
        contents: toGoogleParts(request.contents),
        config,
      };

      // With an onText listener the caller wants the words as they arrive;
      // without one the non-streaming call keeps its exact existing behaviour
      // (structured-output callers pass schemas, not listeners).
      const response = request.onText
        ? await streamVertexContentWithRetry(ai, params, {
            operation: "generateText",
            onText: request.onText,
          })
        : await generateVertexContentWithRetry(ai, params, {
            operation: "generateText",
          });

      return {
        text: response.text || "",
        ...vertexUsage(response.usageMetadata),
      };
    },
  };
}
