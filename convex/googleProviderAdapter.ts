"use node";

import { ThinkingLevel } from "@google/genai";
import type { GenerateContentConfig, Part } from "@google/genai";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import { createVertexGenAIClient, generateVertexContentWithRetry } from "./vertexProviderService";

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

function parseGoogleThinkingLevel(value: string): ThinkingLevel | undefined {
  switch (value) {
    case "MINIMAL":
      return ThinkingLevel.MINIMAL;
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
      const ai = createVertexGenAIClient({ location: args.location });
      const config: GenerateContentConfig = {};

      if (request.systemInstruction) config.systemInstruction = request.systemInstruction;
      if (typeof request.temperature === "number") config.temperature = request.temperature;
      if (typeof request.maxOutputTokens === "number") config.maxOutputTokens = request.maxOutputTokens;
      if (request.thinkingLevel && request.thinkingLevel !== "NONE") {
        const thinkingLevel = parseGoogleThinkingLevel(request.thinkingLevel);
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

      const response = await generateVertexContentWithRetry(ai, {
        model: request.model.providerModelId,
        contents: toGoogleParts(request.contents),
        config,
      }, {
        operation: "generateText",
      });

      return {
        text: response.text || "",
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}
