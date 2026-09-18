"use node";

import {
  ANTHROPIC_PROVIDER_KEY,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
  TYPESAFE_PROVIDER_KEY,
} from "./aiModelService";
import { createOpenRouterProviderAdapter } from "./openrouterProviderService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter, ResolvedAiModelConfig } from "./aiRuntimeTypes";
import { createAnthropicProviderAdapter } from "./anthropicProviderService";
import { createGoogleProviderAdapter } from "./googleProviderAdapter";
import { createOpenAIProviderAdapter } from "./openaiProviderService";
import { appError } from "./utils/appError";

export function getProviderAdapter(providerKey: string): AiProviderAdapter {
  switch (providerKey) {
    case GOOGLE_VERTEX_PROVIDER_KEY:
      return createGoogleProviderAdapter();
    case OPENAI_PROVIDER_KEY:
      return createOpenAIProviderAdapter();
    case ANTHROPIC_PROVIDER_KEY:
      return createAnthropicProviderAdapter();
    case OPENROUTER_PROVIDER_KEY:
      return createOpenRouterProviderAdapter();
    case TYPESAFE_PROVIDER_KEY:
      // Named rather than left to `default` so the message says what happened:
      // a judgment model was asked to write text. `canProviderServeUseCase`
      // keeps this from being reachable through any defaults screen.
      throw appError(
        "INVALID_INPUT",
        "TypeSafe models only make decisions; they cannot write text. Choose a text model for this job.",
      );
    default:
      throw appError("INVALID_INPUT", `AI provider '${providerKey}' is not supported by the runtime registry.`);
  }
}

export async function generateTextWithResolvedModel(args: Omit<AiGenerationRequest, "model"> & {
  model: ResolvedAiModelConfig;
}): Promise<AiGenerationResponse> {
  const adapter = getProviderAdapter(args.model.providerKey);
  return await adapter.generateText(args);
}
