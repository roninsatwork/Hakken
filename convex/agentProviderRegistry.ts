"use node";

import {
  AGENT_CAPABLE_PROVIDER_KEYS,
  ANTHROPIC_PROVIDER_KEY,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
  TYPESAFE_PROVIDER_KEY,
} from "./aiModelService";
import { createAnthropicAgentProvider } from "./anthropicAgentProvider";
import { createGoogleAgentProvider } from "./googleAgentProvider";
import { createOpenAIAgentProvider } from "./openaiAgentProvider";
import { createOpenRouterAgentProvider } from "./openrouterAgentProvider";
import type { AgentProviderAdapter } from "./agentProviderTypes";
import { appError } from "./utils/appError";

/**
 * Which adapter runs an agent on a given provider.
 *
 * Separate from `aiProviderRegistry`, which serves the text-only assistant
 * path. That contract has no tools, no streaming and no caching, so it cannot
 * host an agent — extending it would have meant one interface doing two
 * substantially different jobs.
 *
 * An unsupported provider fails here with a message naming the model, rather
 * than deep inside a provider call. Before this, the agent runtime resolved
 * every model through `getGoogleVertexProviderModelId`, so a perfectly valid
 * catalogue entry on another provider failed with an error about Vertex.
 */
export function getAgentProviderAdapter(providerKey: string): AgentProviderAdapter {
  switch (providerKey) {
    case GOOGLE_VERTEX_PROVIDER_KEY:
      return createGoogleAgentProvider();
    case ANTHROPIC_PROVIDER_KEY:
      return createAnthropicAgentProvider();
    case OPENAI_PROVIDER_KEY:
      return createOpenAIAgentProvider();
    case OPENROUTER_PROVIDER_KEY:
      return createOpenRouterAgentProvider();
    case TYPESAFE_PROVIDER_KEY:
      throw appError(
        "INVALID_INPUT",
        "TypeSafe models only make decisions; they cannot run an agent. Choose a text model for this agent.",
      );
    default:
      throw appError(
        "INVALID_INPUT",
        `The agent runtime cannot run models from provider '${providerKey}'. `
        + "Choose a model from a supported provider, or add an adapter for this one.",
      );
  }
}

/**
 * Whether an agent can run on this provider at all.
 *
 * Delegates to the shared list so the screens and this registry can never
 * disagree about what is runnable.
 */
export function isAgentCapableProvider(providerKey: string | undefined) {
  return AGENT_CAPABLE_PROVIDER_KEYS.has(providerKey ?? "");
}
