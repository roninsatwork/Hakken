import { describe, expect, test } from "vitest";
import { getAgentProviderAdapter, isAgentCapableProvider } from "./agentProviderRegistry";
import {
  ANTHROPIC_PROVIDER_KEY,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
} from "./aiModelService";

/**
 * The agent runtime used to resolve every model through
 * `getGoogleVertexProviderModelId`, which throws for anything that is not
 * Vertex. A perfectly valid catalogue entry on another provider therefore failed
 * with an error about Vertex — the platform accepted any model everywhere
 * except the one place it mattered.
 */

describe("choosing an agent provider", () => {
  test("returns an adapter for each wired provider", () => {
    expect(getAgentProviderAdapter(GOOGLE_VERTEX_PROVIDER_KEY).providerKey)
      .toBe(GOOGLE_VERTEX_PROVIDER_KEY);
    expect(getAgentProviderAdapter(ANTHROPIC_PROVIDER_KEY).providerKey)
      .toBe(ANTHROPIC_PROVIDER_KEY);
    // The gap a live run found, 2026-08-03: the platform default was switched
    // to an OpenAI model and the research agent could not start at all.
    expect(getAgentProviderAdapter(OPENAI_PROVIDER_KEY).providerKey)
      .toBe(OPENAI_PROVIDER_KEY);
    expect(getAgentProviderAdapter(OPENROUTER_PROVIDER_KEY).providerKey)
      .toBe(OPENROUTER_PROVIDER_KEY);
  });

  test("refuses an unsupported provider by name, not with a Vertex error", () => {
    // The old failure blamed Vertex for a model that had nothing to do with it,
    // which sent whoever debugged it looking in the wrong place.
    expect(() => getAgentProviderAdapter("acme-models"))
      .toThrow("cannot run models from provider 'acme-models'");
  });

  test("reports which providers can host an agent", () => {
    expect(isAgentCapableProvider(GOOGLE_VERTEX_PROVIDER_KEY)).toBe(true);
    expect(isAgentCapableProvider(ANTHROPIC_PROVIDER_KEY)).toBe(true);
    expect(isAgentCapableProvider(OPENAI_PROVIDER_KEY)).toBe(true);
    expect(isAgentCapableProvider(OPENROUTER_PROVIDER_KEY)).toBe(true);
    expect(isAgentCapableProvider("acme-models")).toBe(false);
    expect(isAgentCapableProvider(undefined)).toBe(false);
  });
});
