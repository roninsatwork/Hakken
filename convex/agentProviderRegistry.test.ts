import { describe, expect, test } from "vitest";
import { getAgentProviderAdapter, isAgentCapableProvider } from "./agentProviderRegistry";
import { ANTHROPIC_PROVIDER_KEY, GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";

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
  });

  test("refuses an unsupported provider by name, not with a Vertex error", () => {
    // The old failure blamed Vertex for a model that had nothing to do with it,
    // which sent whoever debugged it looking in the wrong place.
    expect(() => getAgentProviderAdapter("openai"))
      .toThrow("cannot run models from provider 'openai'");
  });

  test("reports which providers can host an agent", () => {
    expect(isAgentCapableProvider(GOOGLE_VERTEX_PROVIDER_KEY)).toBe(true);
    expect(isAgentCapableProvider(ANTHROPIC_PROVIDER_KEY)).toBe(true);
    // OpenAI has a text-only adapter for the assistant path; it cannot run an
    // agent, and saying so is what stops a model being offered where it will
    // fail at execution time.
    expect(isAgentCapableProvider("openai")).toBe(false);
    expect(isAgentCapableProvider(undefined)).toBe(false);
  });
});
