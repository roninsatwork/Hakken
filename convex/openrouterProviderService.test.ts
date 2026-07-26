import { describe, expect, test } from "vitest";

import { calculateModelCostGBP } from "./aiCostService";
import {
  convertOpenRouterRateToPerMillion,
  describeOpenRouterCapabilities,
  describeOpenRouterUseCases,
  toOpenRouterCatalogueModel,
} from "./openrouterProviderService";

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
