import { describe, expect, test } from "vitest";
import { getMediaCapabilities, isOpenAITextGenerationModel } from "./aiModelsActions";
import { isVertexTextGenerationModel, parseVertexModelId } from "./vertexProviderService";

/**
 * The catalogue is whatever the provider says it is.
 *
 * Both sync paths used to carry a list of model ids written into the source —
 * six for Vertex, twelve curated for OpenAI. Each one silently decided what
 * existed, went stale without saying so, and turned a failed sync into one that
 * looked successful. A later filter repeated the fault in miniature: models
 * whose names matched no known prefix were dropped without a trace. What is
 * left is rules applied to whatever the provider returns — every model is
 * catalogued, and the rules only decide what tags it carries.
 */
describe("vertex catalogue listing", () => {
  test("takes the model id off the end of the resource name", () => {
    expect(parseVertexModelId("publishers/google/models/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(parseVertexModelId("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(parseVertexModelId(undefined)).toBe("");
  });

  test("tags text generation by what the id is not", () => {
    expect(isVertexTextGenerationModel("gemini-3.1-pro-preview")).toBe(true);
    expect(isVertexTextGenerationModel("gemini-2.5-flash")).toBe(true);
    // A text model outside the Gemini family is still a text model — the
    // gemini prefix requirement was an allowlist by another name.
    expect(isVertexTextGenerationModel("medlm-large")).toBe(true);

    // These are catalogued too, but as what they are, not as chat models.
    expect(isVertexTextGenerationModel("text-embedding-004")).toBe(false);
    expect(isVertexTextGenerationModel("imagen-3.0-generate-001")).toBe(false);
    expect(isVertexTextGenerationModel("veo-2.0-generate-001")).toBe(false);
    expect(isVertexTextGenerationModel("gemini-2.5-flash-tts")).toBe(false);
    expect(isVertexTextGenerationModel("gemini-live-2.5-flash")).toBe(false);
    expect(isVertexTextGenerationModel("")).toBe(false);
  });

  test("a model Google releases tomorrow is picked up by the rule", () => {
    // The whole point of removing the list: nothing has to be edited here for a
    // new Gemini — or a newly named family — to appear in the catalogue.
    expect(isVertexTextGenerationModel("gemini-4.0-ultra")).toBe(true);
  });
});

describe("openai catalogue listing", () => {
  test("tags text generation by what the id is not", () => {
    expect(isOpenAITextGenerationModel("gpt-5-mini")).toBe(true);
    expect(isOpenAITextGenerationModel("o3")).toBe(true);
    expect(isOpenAITextGenerationModel("chatgpt-4o-latest")).toBe(true);

    expect(isOpenAITextGenerationModel("text-embedding-3-small")).toBe(false);
    expect(isOpenAITextGenerationModel("whisper-1")).toBe(false);
    expect(isOpenAITextGenerationModel("dall-e-3")).toBe(false);
    expect(isOpenAITextGenerationModel("tts-1")).toBe(false);
  });

  test("a model family with a brand-new name is text generation by default", () => {
    // The old rule ended with a prefix allowlist — gpt-, o1, o3, o4, chatgpt- —
    // so a family named without one would have vanished from the sync. Unknown
    // names now default in rather than out.
    expect(isOpenAITextGenerationModel("gpt-6-turbo")).toBe(true);
    expect(isOpenAITextGenerationModel("sol-1")).toBe(true);
    expect(isOpenAITextGenerationModel("luna-preview")).toBe(true);
  });

  test("non-text models are tagged by their markers", () => {
    expect(getMediaCapabilities("dall-e-3")).toEqual(["image"]);
    expect(getMediaCapabilities("sora-2")).toEqual(["video"]);
    expect(getMediaCapabilities("whisper-1")).toEqual(["audio"]);
    expect(getMediaCapabilities("gpt-4o-mini-tts")).toEqual(["audio"]);
    expect(getMediaCapabilities("omni-moderation-latest")).toEqual(["moderation"]);
  });
});
