import { describe, expect, test, vi } from "vitest";

import { createAnthropicProviderAdapter } from "./anthropicProviderService";
import { createOpenAIProviderAdapter } from "./openaiProviderService";
import { createOpenRouterProviderAdapter } from "./openrouterProviderService";

/**
 * Structured output, asked for the same way of every provider.
 *
 * Intent routing, report generation and workflow-node configuration all needed a
 * JSON answer matching a schema, and all three were written directly against
 * Vertex's `responseSchema`. That — not any limit of the models — is why they
 * could only run on one provider.
 *
 * These tests drive each adapter with a stubbed transport and read the request
 * it built, because the mapping is where a provider-neutral request quietly
 * stops being honoured. A schema that is silently dropped does not fail: it
 * returns prose where the caller expects JSON, and the caller's `JSON.parse`
 * throws somewhere else entirely.
 */
const SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
};

function stubFetch(payload: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}

function lastRequestBody(fetchImpl: ReturnType<typeof stubFetch>) {
  const init = fetchImpl.mock.calls.at(-1)?.[1];
  return JSON.parse(String(init?.body ?? "{}"));
}

describe("structured output reaches every provider", () => {
  test("OpenRouter asks for a json_schema response format", async () => {
    const fetchImpl = stubFetch({ choices: [{ message: { content: '{"answer":"yes"}' } }] });
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.generateText({
      model: { modelId: "openrouter:vendor/model", providerKey: "openrouter", providerModelId: "vendor/model" },
      contents: [{ type: "text", text: "Answer." }],
      jsonSchema: SCHEMA,
    });

    expect(lastRequestBody(fetchImpl).response_format).toMatchObject({
      type: "json_schema",
      json_schema: { schema: SCHEMA },
    });
    expect(result.text).toBe('{"answer":"yes"}');
  });

  test("OpenAI asks for a json_schema text format", async () => {
    const fetchImpl = stubFetch({ output_text: '{"answer":"yes"}' });
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await adapter.generateText({
      model: { modelId: "openai:some-model", providerKey: "openai", providerModelId: "some-model" },
      contents: [{ type: "text", text: "Answer." }],
      jsonSchema: SCHEMA,
    });

    expect(lastRequestBody(fetchImpl).text).toMatchObject({
      format: { type: "json_schema", schema: SCHEMA },
    });
  });

  /**
   * Anthropic has no `response_format`, so the schema becomes a forced tool call
   * and the answer is read from the arguments the model passed. Asking politely
   * for JSON in the prompt is the alternative, and it fails silently whenever the
   * model wraps the answer in prose.
   */
  test("Anthropic forces a tool call shaped like the schema and reads it back", async () => {
    const fetchImpl = stubFetch({
      content: [{ type: "tool_use", name: "structured_response", input: { answer: "yes" } }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });
    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.generateText({
      model: { modelId: "anthropic:some-model", providerKey: "anthropic", providerModelId: "some-model" },
      contents: [{ type: "text", text: "Answer." }],
      jsonSchema: SCHEMA,
    });

    const body = lastRequestBody(fetchImpl);
    expect(body.tools).toEqual([{
      name: "structured_response",
      description: "Return the answer in the required structure.",
      input_schema: SCHEMA,
    }]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "structured_response" });
    // The caller does `JSON.parse` on this, so it must be the JSON itself.
    expect(JSON.parse(result.text)).toEqual({ answer: "yes" });
  });

  test("no schema means no structured-output request is made at all", async () => {
    const fetchImpl = stubFetch({ choices: [{ message: { content: "Plain prose." } }] });
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await adapter.generateText({
      model: { modelId: "openrouter:vendor/model", providerKey: "openrouter", providerModelId: "vendor/model" },
      contents: [{ type: "text", text: "Chat." }],
    });

    expect(lastRequestBody(fetchImpl).response_format).toBeUndefined();
  });
});
