"use node";

import { ANTHROPIC_PROVIDER_KEY, GOOGLE_VERTEX_PROVIDER_KEY, OPENAI_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter, ResolvedAiModelConfig } from "./aiRuntimeTypes";
import { createAnthropicProviderAdapter } from "./anthropicProviderService";
import { createGoogleProviderAdapter } from "./googleProviderAdapter";
import { createOpenAIProviderAdapter } from "./openaiProviderService";

export function getProviderAdapter(providerKey: string): AiProviderAdapter {
  switch (providerKey) {
    case GOOGLE_VERTEX_PROVIDER_KEY:
      return createGoogleProviderAdapter();
    case OPENAI_PROVIDER_KEY:
      return createOpenAIProviderAdapter();
    case ANTHROPIC_PROVIDER_KEY:
      return createAnthropicProviderAdapter();
    default:
      throw new Error(`AI provider '${providerKey}' is not supported by the runtime registry.`);
  }
}

export async function generateTextWithResolvedModel(args: Omit<AiGenerationRequest, "model"> & {
  model: ResolvedAiModelConfig;
}): Promise<AiGenerationResponse> {
  const adapter = getProviderAdapter(args.model.providerKey);
  return await adapter.generateText(args);
}
