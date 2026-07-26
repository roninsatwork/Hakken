import { describe, expect, test } from "vitest";
import { isOpenAITextGenerationModel } from "./aiModelsActions";
import { isUsableVertexModel, parseVertexModelId } from "./vertexProviderService";

/**
 * The catalogue is whatever the provider says it is.
 *
 * Both sync paths used to carry a list of model ids written into the source —
 * six for Vertex, twelve curated for OpenAI. Each one silently decided what
 * existed, went stale without saying so, and turned a failed sync into one that
 * looked successful. What is left is rules applied to whatever the provider
 * returns, and those rules are what these tests pin down.
 */
describe("vertex catalogue listing", () => {
  test("takes the model id off the end of the resource name", () => {
    expect(parseVertexModelId("publishers/google/models/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(parseVertexModelId("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(parseVertexModelId(undefined)).toBe("");
  });

  test("keeps the models this platform can call and drops the rest", () => {
    // Text generation and embeddings are the two things the runtime does.
    expect(isUsableVertexModel("gemini-3.1-pro-preview")).toBe(true);
    expect(isUsableVertexModel("gemini-2.5-flash")).toBe(true);
    expect(isUsableVertexModel("text-embedding-004")).toBe(true);

    // Vertex publishes far more than that from the same call. Listing these
    // would fill the catalogue with models nothing here can reach.
    expect(isUsableVertexModel("imagen-3.0-generate-001")).toBe(false);
    expect(isUsableVertexModel("veo-2.0-generate-001")).toBe(false);
    expect(isUsableVertexModel("gemini-2.5-flash-tts")).toBe(false);
    expect(isUsableVertexModel("gemini-live-2.5-flash")).toBe(false);
    expect(isUsableVertexModel("medlm-large")).toBe(false);
    expect(isUsableVertexModel("")).toBe(false);
  });

  test("a model Google releases tomorrow is picked up by the rule", () => {
    // The whole point of removing the list: nothing has to be edited here for a
    // new Gemini to appear in the catalogue.
    expect(isUsableVertexModel("gemini-4.0-ultra")).toBe(true);
  });
});

describe("openai catalogue listing", () => {
  test("keeps text generation models and drops every other kind", () => {
    expect(isOpenAITextGenerationModel("gpt-5-mini")).toBe(true);
    expect(isOpenAITextGenerationModel("o3")).toBe(true);
    expect(isOpenAITextGenerationModel("chatgpt-4o-latest")).toBe(true);

    expect(isOpenAITextGenerationModel("text-embedding-3-small")).toBe(false);
    expect(isOpenAITextGenerationModel("whisper-1")).toBe(false);
    expect(isOpenAITextGenerationModel("dall-e-3")).toBe(false);
    expect(isOpenAITextGenerationModel("tts-1")).toBe(false);
  });

  test("a model the curated list never knew about is kept", () => {
    expect(isOpenAITextGenerationModel("gpt-6-turbo")).toBe(true);
  });
});
