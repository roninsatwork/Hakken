import { describe, expect, test } from "vitest";

import { calculateModelCostGBP } from "./aiCostService";
import {
  convertOpenRouterRateToPerMillion,
  createOpenRouterProviderAdapter,
  describeOpenRouterCapabilities,
  describeOpenRouterUseCases,
  toOpenRouterCatalogueModel,
} from "./openrouterProviderService";

const MODEL = {
  modelId: "openrouter:vendor/test-model",
  providerKey: "openrouter",
  providerModelId: "vendor/test-model",
};

function sseResponse(frames: unknown[]) {
  const body = [...frames.map((frame) => `data: ${JSON.stringify(frame)}`), "data: [DONE]", ""].join("\n\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A stream that delivers one frame and then dies, the way a dropped connection does. */
function dyingSseResponse(frame: unknown) {
  const encoder = new TextEncoder();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    // Pull-based so the frame is genuinely read before the failure lands;
    // erroring inside start() can discard the queued chunk entirely.
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        return;
      }
      controller.error(new Error("connection reset"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/**
 * The assistant path streams on OpenRouter.
 *
 * The agent loop already streams here; these tests hold the plain-text adapter
 * to the same rules — fragments reach the listener as they arrive, usage
 * survives the stream, a failure before the first fragment retries, and a
 * failure after it does not, because a retry would replay what the reader has
 * already seen.
 */
describe("openrouter assistant streaming", () => {
  test("a reply streams through onText and lands with usage intact", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async (url, init) => {
        captured = { url: String(url), body: JSON.parse(String(init?.body)) };
        return sseResponse([
          { choices: [{ delta: { content: "Here is " } }] },
          { choices: [{ delta: { content: "the answer." }, finish_reason: "stop" }] },
          { choices: [], usage: { prompt_tokens: 40, completion_tokens: 6 } },
        ]);
      },
    });

    const fragments: string[] = [];
    const response = await adapter.generateText({
      model: MODEL,
      systemInstruction: "Be concise.",
      contents: [{ type: "text", text: "What is our refund policy?" }],
      onText: (fragment) => { fragments.push(fragment); },
    });

    expect(fragments.join("")).toBe("Here is the answer.");
    expect(response).toMatchObject({
      text: "Here is the answer.",
      inputTokens: 40,
      outputTokens: 6,
    });
    expect(captured?.body).toMatchObject({
      model: "vendor/test-model",
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "What is our refund policy?" },
      ],
    });
  });

  test("without a listener the single-write path is untouched", async () => {
    let captured: Record<string, unknown> | undefined;
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        captured = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Short and unstreamed." } }],
          usage: { prompt_tokens: 5, completion_tokens: 4 },
        }), { status: 200 });
      },
    });

    const response = await adapter.generateText({
      model: MODEL,
      contents: [{ type: "text", text: "Quick one." }],
    });

    expect(response.text).toBe("Short and unstreamed.");
    expect(captured).not.toHaveProperty("stream");
  });

  test("a failure before the first fragment retries; the retry succeeds", async () => {
    let calls = 0;
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("temporarily unavailable", { status: 503 });
        }
        return sseResponse([
          { choices: [{ delta: { content: "Recovered." }, finish_reason: "stop" }] },
        ]);
      },
    });

    const response = await adapter.generateText({
      model: MODEL,
      contents: [{ type: "text", text: "Try twice." }],
      onText: () => {},
    });

    expect(calls).toBe(2);
    expect(response.text).toBe("Recovered.");
  }, 15_000);

  test("a stream that dies after the first fragment is not retried", async () => {
    let calls = 0;
    const adapter = createOpenRouterProviderAdapter({
      env: { OPENROUTER_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        return dyingSseResponse({ choices: [{ delta: { content: "the answer was going well " } }] });
      },
    });

    const fragments: string[] = [];
    await expect(adapter.generateText({
      model: MODEL,
      contents: [{ type: "text", text: "Doomed question." }],
      onText: (fragment) => { fragments.push(fragment); },
    })).rejects.toThrow();

    // The reader saw text, so a retry would have replayed the answer.
    expect(calls).toBe(1);
    expect(fragments.join("")).toContain("the answer was going well");
  });
});

/**
 * OpenRouter quotes per token; this catalogue stores per million.
 *
 * That is a factor of a million, and this codebase has already shipped a bug of
 * exactly that size in the other direction — the admin screens multiplied a
 * per-million rate by a million and advertised models at tens of thousands of
 * pounds. So the conversion is pinned against what the cost service actually
 * charges rather than against a number written down twice.
 */
describe("openrouter pricing", () => {
  test("a per-token rate becomes the per-million rate the cost service applies", () => {
    // $3 per million input, $15 per million output, quoted per token.
    const inputPerMillion = convertOpenRouterRateToPerMillion("0.000003");
    const outputPerMillion = convertOpenRouterRateToPerMillion("0.000015");

    expect(inputPerMillion).toBeCloseTo(3, 6);
    expect(outputPerMillion).toBeCloseTo(15, 6);

    // Charged in a 100k slice and scaled, because the stored rate is the
    // below-200k one and a literal million-token call is charged at the
    // large-context rate.
    const SLICE = 100_000;
    const charge = calculateModelCostGBP({
      inputTokens: SLICE,
      outputTokens: SLICE,
      rates: {
        standardInputCostBelow200k: inputPerMillion,
        outputResponseCost: outputPerMillion,
      },
    }) * (1_000_000 / SLICE);

    // A million in and a million out at the provider's published prices.
    expect(charge).toBeCloseTo(18, 6);
  });

  test("a free model is priced at zero, not treated as unpriced", () => {
    expect(convertOpenRouterRateToPerMillion("0")).toBe(0);
  });

  test("a missing or nonsense rate is left unset rather than guessed at", () => {
    expect(convertOpenRouterRateToPerMillion(undefined)).toBeUndefined();
    expect(convertOpenRouterRateToPerMillion("")).toBeUndefined();
    expect(convertOpenRouterRateToPerMillion("not-a-number")).toBeUndefined();
    expect(convertOpenRouterRateToPerMillion("-1")).toBeUndefined();
  });
});

/**
 * Capabilities come from what OpenRouter reports, not from the model id.
 *
 * The id-based guess used for the other providers adds "reasoning" to anything
 * starting with "o", which would tag every model in the `openai/` namespace.
 */
describe("openrouter capabilities", () => {
  test("are read from the provider's own metadata", () => {
    const capabilities = describeOpenRouterCapabilities({
      architecture: { input_modalities: ["text", "image"] },
      supported_parameters: ["tools", "response_format", "reasoning"],
    });

    expect(capabilities).toEqual(expect.arrayContaining(["text", "vision", "tool-calling", "json-mode", "reasoning"]));
  });

  test("a plain text model is not credited with more than it has", () => {
    const capabilities = describeOpenRouterCapabilities({
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["temperature"],
    });

    expect(capabilities).toEqual(["text"]);
    expect(describeOpenRouterUseCases(capabilities)).not.toContain("reasoning");
    expect(describeOpenRouterUseCases(capabilities)).not.toContain("vision");
  });

  test("a model whose id starts with a vendor prefix is not guessed to be a reasoning model", () => {
    const model = toOpenRouterCatalogueModel({
      id: "openai/some-chat-model",
      name: "Some Chat Model",
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["temperature"],
    });

    expect(model?.capabilities).not.toContain("reasoning");
  });
});

describe("openrouter catalogue entries", () => {
  test("carry the price, context window and readable name straight through", () => {
    const model = toOpenRouterCatalogueModel({
      id: "vendor/some-model",
      name: "Vendor: Some Model",
      description: "A model.",
      context_length: 200_000,
      top_provider: { max_completion_tokens: 8_192 },
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["tools"],
      pricing: { prompt: "0.0000005", completion: "0.0000015" },
    });

    expect(model).toMatchObject({
      modelId: "vendor/some-model",
      displayName: "Vendor: Some Model",
      contextWindowTokens: 200_000,
      maxOutputTokens: 8_192,
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
    });
  });

  test("an entry with no id is dropped rather than stored nameless", () => {
    expect(toOpenRouterCatalogueModel({ name: "No Id" })).toBeNull();
  });
});
